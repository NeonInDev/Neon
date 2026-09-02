const fs = require('fs')
const path = require('path')
const { exec: execCb } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(execCb)
const { log } = require('./logger')

const TMP = process.env.TEMP || 'C:\\Temp'
const FFMPEG = require('ffmpeg-static') || 'ffmpeg'
const TTS_VOICE_DEFAULT = process.env.TTS_VOICE_DEFAULT || process.env.VOZ_NEON || 'pt-BR-FranciscaNeural'
const TTS_VOICE_ULTRON = process.env.TTS_VOICE_ULTRON || 'pt-BR-AntonioNeural'
const CACHE_SIZE = parseInt(process.env.TTS_CACHE_SIZE, 10) || 20

let edgeTts = null
try { edgeTts = require('edge-tts-universal') } catch (e) { log('INFO', '[TTS] edge-tts-universal nao instalado') }

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

// Converte velocidade (1.0 = normal) e tom (Hz, ex: +5) pros formatos do
// edge-tts-universal: rate e pitch aceitam "+20%", "-10Hz", etc.
function paraRate(velocidade) {
  const v = Math.max(0.5, Math.min(2.0, Number(velocidade) || 1.0))
  if (v === 1.0) return null
  const pct = Math.round((v - 1.0) * 100)
  return (pct >= 0 ? "+" : "") + pct + "%"
}
function paraPitch(tom) {
  const hz = Math.max(-50, Math.min(50, Number(tom) || 0))
  if (hz === 0) return null
  return (hz >= 0 ? "+" : "") + hz + "Hz"
}

async function gerarAudio(texto, voz = 'auto', velocidade = 1.0, tom = 0) {
  if (!texto) return null
  const t = String(texto).slice(0, 2000)
  const voice = voz === 'auto' ? TTS_VOICE_DEFAULT : voz
  const key = `${voice}|${velocidade}|${tom}|${t}`
  const cached = cacheGet(key)
  if (cached) return Buffer.from(cached)

  // Try Edge TTS first
  if (edgeTts) {
    try {
      const tts = new edgeTts.UniversalEdgeTTS(t, voice)
      // Variação nativa de tom (pitch) e velocidade (rate) — sem perder qualidade
      const rate = paraRate(velocidade)
      const pitch = paraPitch(tom)
      if (rate) tts.rate = rate
      if (pitch) tts.pitch = pitch
      const result = await tts.synthesize()
      let buf = Buffer.from(await result.audio.arrayBuffer())

      // Fallback p/ velocidade se o motor nativo não aplicar (muito marginal):
      // mantemos o buffer tal qual; rate nativo já cobre a velocidade.

      cacheSet(key, buf)
      return Buffer.from(buf)
    } catch (err) {
      log('WARN', '[TTS] Edge TTS falhou', { erro: err.message?.slice(0, 200) })
    }
  }

  // Fallback to SAPI (Windows) - produce WAV then convert to MP3
  try {
    const wavFile = safeFilename('neon_tts') + '.wav'
    const safeText = t.replace(/'/g, "''").replace(/"/g, '""')
    const cmd = `powershell -NoProfile -Command "$v = New-Object -ComObject Sapi.SpVoice; $f = New-Object -ComObject Sapi.SpFileStream; $f.Open('"${wavFile}"', 3, 0); $v.AudioOutputStream = $f; $v.Speak('${safeText}'); $f.Close()"`
    await execAsync(cmd, { timeout: 20000, windowsHide: true })
    const mp3File = wavFile.replace(/\.wav$/i, '.mp3')
    await execAsync(`"${FFMPEG}" -y -i "${wavFile}" -b:a 128k "${mp3File}"`, { timeout: 20000, windowsHide: true })
    const buf = fs.readFileSync(mp3File)
    try { fs.unlinkSync(wavFile) } catch {}
    try { fs.unlinkSync(mp3File) } catch {}
    cacheSet(key, buf)
    return Buffer.from(buf)
  } catch (err) {
    log('ERROR', '[TTS] Fallback SAPI falhou', { erro: err.message?.slice(0, 200) })
    return null
  }
}

async function falar(texto, voz = 'auto', velocidade = 1.0, tom = 0) {
  if (!texto) return
  const mp3 = await gerarAudio(texto, voz, velocidade, tom)
  if (!mp3) return
  const ts = Date.now()
  const mp3File = path.join(TMP, `neon_tts_play_${ts}.mp3`)
  const wavFile = path.join(TMP, `neon_tts_play_${ts}.wav`)
  fs.writeFileSync(mp3File, mp3)
  try {
    await execAsync(`"${FFMPEG}" -y -i "${mp3File}" -f wav "${wavFile}"`, { timeout: 30000, windowsHide: true })
    fs.unlinkSync(mp3File)
    const safe = wavFile.replace(/'/g, "''")
    await execAsync(`powershell -NoProfile -Command "(New-Object Media.SoundPlayer '${safe}').PlaySync()"`, { timeout: 60000, windowsHide: true })
    try { fs.unlinkSync(wavFile) } catch {}
  } catch (err) {
    log('WARN', '[TTS] Play falhou', { erro: err.message?.slice(0, 200) })
    try { fs.unlinkSync(mp3File) } catch {}
    try { fs.unlinkSync(wavFile) } catch {}
  }
}

async function testar() {
  if (!edgeTts) return { ok: false, motivo: 'edge-tts-universal nao instalado' }
  return { ok: true, metodo: `Edge TTS Neural (${TTS_VOICE_DEFAULT})` }
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

module.exports = { gerarAudio, falar, falarComEmocao, vozDaEmocao, listarEmocoes, falarResumoMatinal, testar, TTS_VOICE_DEFAULT, TTS_VOICE_ULTRON }