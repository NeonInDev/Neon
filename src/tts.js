const fs = require('fs')
const path = require('path')
const { exec: execCb, execFile: execFileCb, spawn } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(execCb)
const execFileAsync = promisify(execFileCb)
const { log } = require('./logger')

const TMP = process.env.TEMP || 'C:\\Temp'
const FFMPEG = require('ffmpeg-static') || 'ffmpeg'
const APP_ROOT = path.resolve(__dirname, '..')
const PIPER_DIR = path.join(APP_ROOT, '.neon-opencode', 'piper', 'runtime', 'piper')
const PIPER_EXE = path.join(PIPER_DIR, 'piper.exe')
const PIPER_MODEL = path.join(APP_ROOT, '.neon-opencode', 'piper', 'models', 'pt_BR-faber-medium.onnx')
const PIPER_CONFIG = `${PIPER_MODEL}.json`
const TTS_VOICE_DEFAULT = process.env.TTS_VOICE_DEFAULT || process.env.VOZ_NEON || 'pt-BR-FranciscaNeural'
const TTS_VOICE_ULTRON = process.env.TTS_VOICE_ULTRON || 'pt-BR-AntonioNeural'
const CACHE_SIZE = parseInt(process.env.TTS_CACHE_SIZE, 10) || 20

// Simple LRU cache using Map insertion order
const CACHE = new Map()
function cacheGet(key) {
  if (!CACHE.has(key)) return null
  const v = CACHE.get(key)
  CACHE.delete(key)
  CACHE.set(key, v)
  return v
}
function cacheSet(key, val) {
  if (CACHE.has(key)) CACHE.delete(key)
  CACHE.set(key, val)
  while (CACHE.size > CACHE_SIZE) {
    const k = CACHE.keys().next().value
    CACHE.delete(k)
  }
}

function safeFilename(prefix) {
  return path.join(TMP, `${prefix}_${Date.now()}`)
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function psCommand(script) {
  return execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64'),
  ], { timeout: 90000, windowsHide: true })
}

function sintetizarPiper(texto, wavFile, velocidade) {
  return new Promise((resolve, reject) => {
    const ritmo = Math.max(0.5, Math.min(2.0, Number(velocidade) || 1.0))
    const child = spawn(PIPER_EXE, [
      '--model', PIPER_MODEL,
      '--config', PIPER_CONFIG,
      '--output_file', wavFile,
      '--length_scale', String(1 / ritmo),
      '--quiet',
    ], { cwd: PIPER_DIR, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    let timer
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-2000) })
    child.once('error', (err) => { clearTimeout(timer); reject(err) })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && fs.existsSync(wavFile)) resolve()
      else reject(new Error(`Piper terminou com código ${code}: ${stderr.trim()}`))
    })
    timer = setTimeout(() => {
      child.kill()
      reject(new Error('Piper excedeu o tempo limite'))
    }, 45000)
    child.stdin.on('error', () => {})
    child.stdin.end(`${texto}\n`)
  })
}

async function sintetizarSapi(texto, wavFile) {
  const script = `$ErrorActionPreference='Stop'; $v=New-Object -ComObject Sapi.SpVoice; $f=New-Object -ComObject Sapi.SpFileStream; $f.Open(${psQuote(wavFile)},3,$false); $v.AudioOutputStream=$f; [void]$v.Speak(${psQuote(texto)}); $f.Close()`
  await psCommand(script)
}

async function gerarAudio(texto, voz = 'auto', velocidade = 1.0, tom = 0) {
  if (!texto) return null
  const t = String(texto).slice(0, 2000)
  const key = `${voz}|${velocidade}|${tom}|${t}`
  const cached = cacheGet(key)
  if (cached) return Buffer.from(cached)

  const wavFile = safeFilename('neon_tts') + '.wav'
  const mp3File = wavFile.replace(/\.wav$/i, '.mp3')
  try {
    if (fs.existsSync(PIPER_EXE) && fs.existsSync(PIPER_MODEL) && fs.existsSync(PIPER_CONFIG)) {
      try {
        await sintetizarPiper(t, wavFile, velocidade)
      } catch (err) {
        log('WARN', '[TTS] Piper offline falhou; usando SAPI local', { erro: err.message?.slice(0, 200) })
        await sintetizarSapi(t, wavFile)
      }
    } else {
      await sintetizarSapi(t, wavFile)
    }
    await execAsync(`"${FFMPEG}" -y -i "${wavFile}" -b:a 128k "${mp3File}"`, { timeout: 20000, windowsHide: true })
    const buf = fs.readFileSync(mp3File)
    try { fs.unlinkSync(wavFile) } catch {}
    try { fs.unlinkSync(mp3File) } catch {}
    cacheSet(key, buf)
    return Buffer.from(buf)
  } catch (err) {
    log('ERROR', '[TTS] TTS offline falhou', { erro: err.message?.slice(0, 200) })
    try { fs.unlinkSync(wavFile) } catch {}
    try { fs.unlinkSync(mp3File) } catch {}
    return null
  }
}

async function falar(texto, voz = 'auto', velocidade = 1.0, tom = 0) {
  if (!texto) return
  const mp3 = await gerarAudio(texto, voz, velocidade, tom)
  if (!mp3) return
  const ts = Date.now()
  const mp3File = path.join(TMP, `neon_tts_play_${ts}.mp3`)
  fs.writeFileSync(mp3File, mp3)
  try {
    // Caminho rápido: toca direto o MP3 via WindowsMediaPlayer (evita ffmpeg + SAPI).
    // Resulta em MUITO menos latência de reprodução.
    const tocouDireto = await tocarMp3Direto(mp3File)
    if (!tocouDireto) {
      // Fallback: converte p/ WAV e toca com SoundPlayer (compatibilidade total)
      const wavFile = path.join(TMP, `neon_tts_play_${ts}.wav`)
      await execAsync(`"${FFMPEG}" -y -i "${mp3File}" -f wav "${wavFile}"`, { timeout: 30000, windowsHide: true })
      fs.unlinkSync(mp3File)
      const safe = wavFile.replace(/'/g, "''")
      await execAsync(`powershell -NoProfile -Command "(New-Object Media.SoundPlayer '${safe}').PlaySync()"`, { timeout: 60000, windowsHide: true })
      try { fs.unlinkSync(wavFile) } catch {}
    } else {
      try { fs.unlinkSync(mp3File) } catch {}
    }
  } catch (err) {
    log('WARN', '[TTS] Play falhou', { erro: err.message?.slice(0, 200) })
    try { fs.unlinkSync(mp3File) } catch {}
  }
}

// Toca um MP3 direto usando a Windows Media Player (COM) em um processo.
// Leve e rápido. Retorna true se conseguiu tocar.
async function tocarMp3Direto(mp3File) {
  try {
    const script = `$ErrorActionPreference='Stop'; $p=New-Object -ComObject WMPlayer.OCX; $p.settings.mute=0; $p.URL=${psQuote(mp3File)}; $limite=(Get-Date).AddSeconds(5); while (($null -eq $p.currentMedia -or $p.currentMedia.duration -le 0) -and (Get-Date) -lt $limite) { Start-Sleep -Milliseconds 100 }; if ($null -eq $p.currentMedia -or $p.currentMedia.duration -le 0) { throw 'O player não carregou o áudio' }; $p.controls.play(); $duracao=[math]::Min(80,[math]::Max(1,$p.currentMedia.duration)); Start-Sleep -Milliseconds ([int](($duracao+0.7)*1000)); $p.close()`
    await psCommand(script)
    return true
  } catch (err) {
    log('WARN', '[TTS] tocarMp3Direto falhou', { erro: err.message?.slice(0, 200) })
    return false
  }
}

async function testar() {
  return fs.existsSync(PIPER_EXE) && fs.existsSync(PIPER_MODEL) && fs.existsSync(PIPER_CONFIG)
    ? { ok: true, metodo: 'Piper pt-BR Faber (offline)' }
    : { ok: true, metodo: 'SAPI local do Windows (offline)' }
}

// Mapeia uma emoção/contexto pra { velocidade, tom } de fala.
// Deixa a Neon "variar tom e velocidade" conforme a situação.
const MAPA_EMOCAO = {
  alegre:   { velocidade: 1.12, tom: 8 },
  triste:   { velocidade: 0.95, tom: -4 },
  animada:  { velocidade: 1.2,  tom: 10 },
  calma:    { velocidade: 0.98, tom: -2 },
  urgente:  { velocidade: 1.25, tom: 6 },
  seria:    { velocidade: 1.0,  tom: -3 },
  ultron:   { velocidade: 1.15, tom: -12 },
  matinal:  { velocidade: 1.05, tom: 4 },
  normal:   { velocidade: 1.0,  tom: 0 },
}

function vozDaEmocao(emocao) {
  const m = (MAPA_EMOCAO[String(emocao).toLowerCase()] || MAPA_EMOCAO.normal)
  return { velocidade: m.velocidade, tom: m.tom }
}

// Fala aplicando voz/tom/velocidade de uma emoção. Ex.: falarComEmocao('Abre logo!', 'urgente')
async function falarComEmocao(texto, emocao = 'normal', voz = 'auto') {
  const { velocidade, tom } = vozDaEmocao(emocao)
  return falar(texto, voz, velocidade, tom)
}

function listarEmocoes() {
  return Object.keys(MAPA_EMOCAO)
}

// Resumo matinal FALADO: monta um textinho de bom dia e lê em voz alta com
// tom/velocidade 'matinal'. Opcionalmente adiciona clima se vier no parâmetro.
async function falarResumoMatinal(resumo = null) {
  let texto = 'Bom dia, chefe. '
  if (resumo) texto += String(resumo).slice(0, 300)
  else texto += 'Pronto pra mais um dia por aqui? '
  return falarComEmocao(texto, 'matinal')
}

module.exports = { gerarAudio, falar, falarComEmocao, vozDaEmocao, listarEmocoes, falarResumoMatinal, testar, tocarMp3Direto, TTS_VOICE_DEFAULT, TTS_VOICE_ULTRON }
