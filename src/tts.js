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

async function gerarAudio(texto, voz = 'auto', velocidade = 1.0) {
  if (!texto) return null
  const t = String(texto).slice(0, 2000)
  const voice = voz === 'auto' ? TTS_VOICE_DEFAULT : voz
  const key = `${voice}|${velocidade}|${t}`
  const cached = cacheGet(key)
  if (cached) return Buffer.from(cached)

  // Try Edge TTS first
  if (edgeTts) {
    try {
      const options = { voice }
      // edge-tts-universal supports SSML via UniversalEdgeTTS if needed
      const tts = new edgeTts.UniversalEdgeTTS(t, voice)
      const result = await tts.synthesize()
      let buf = Buffer.from(await result.audio.arrayBuffer())

      // If velocidade != 1.0, adjust using ffmpeg atempo (supports 0.5-2.0)
      if (Number(velocidade) && Number(velocidade) !== 1.0) {
        const inFile = safeFilename('neon_tts_in') + '.mp3'
        const outFile = safeFilename('neon_tts_out') + '.mp3'
        fs.writeFileSync(inFile, buf)
        const speed = Number(velocidade)
        // clamp atempo to 0.5-2.0
        const atempo = Math.max(0.5, Math.min(2.0, speed))
        await execAsync(`"${FFMPEG}" -y -i "${inFile}" -filter:a "atempo=${atempo}" -b:a 128k "${outFile}"`, { timeout: 30000, windowsHide: true })
        try { buf = fs.readFileSync(outFile) } catch {}
        try { fs.unlinkSync(inFile) } catch {}
        try { fs.unlinkSync(outFile) } catch {}
      }

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

async function falar(texto, voz = 'auto', velocidade = 1.0) {
  if (!texto) return
  const mp3 = await gerarAudio(texto, voz, velocidade)
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

module.exports = { gerarAudio, falar, testar, TTS_VOICE_DEFAULT, TTS_VOICE_ULTRON }