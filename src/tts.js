const { log } = require("./logger")
const { exec: execCb } = require("child_process")
const { promisify } = require("util")
const fs = require("fs")
const path = require("path")
const execAsync = promisify(execCb)
const TMP = process.env.TEMP || "C:\\Temp"
const FFMPEG = require("ffmpeg-static") || "ffmpeg"

let edgeTts = null
try { edgeTts = require("edge-tts-universal") } catch {}

const EMOJIS = /[\p{Extended_Pictographic}\u200d\uFE0F]/gu

function limparFala(texto) {
  return (texto || "").replace(/[*_`~#|\[\]]/g, "").replace(EMOJIS, "").slice(0, 500)
}

async function gerarAudio(texto, voz = "auto") {
  if (!texto) return null;
  const t = limparFala(texto);
  if (!edgeTts) return null;
  const voice = voz === "auto" ? "pt-BR-FranciscaNeural" : voz;
  const tts = new edgeTts.UniversalEdgeTTS(t, voice);
  const result = await tts.synthesize();
  return Buffer.from(await result.audio.arrayBuffer());
}

async function falar(texto, voz = "auto") {
  if (!texto) return
  const t = limparFala(texto)
  if (edgeTts) {
    try {
      const mp3 = await gerarAudio(t, voz)
      const ts = Date.now()
      const mp3File = path.join(TMP, `neon_tts_${ts}.mp3`)
      const wavFile = path.join(TMP, `neon_tts_${ts}.wav`)
      fs.writeFileSync(mp3File, mp3)
      await execAsync(`"${FFMPEG}" -y -i "${mp3File}" -f wav "${wavFile}"`, { timeout: 30000, windowsHide: true })
      fs.unlink(mp3File, () => {})
      const safe = wavFile.replace(/'/g, "''")
      await execAsync(`powershell -NoProfile -Command "(New-Object Media.SoundPlayer '${safe}').PlaySync()"`, { timeout: 60000, windowsHide: true })
      fs.unlink(wavFile, () => {})
      return
    } catch (e) {
      log("WARN", "Edge TTS falhou, caindo pra fallback", { erro: e.message })
    }
  }
  const safe = t.replace(/'/g, "''").replace(/"/g, '""')
  const fallback = `powershell -NoProfile -Command "(New-Object -ComObject Sapi.SpVoice).Speak('${safe}')"`
  await execAsync(fallback, { timeout: 15000 }).catch(() => {})
}

async function testar() {
  if (!edgeTts) return { ok: false, motivo: "edge-tts-universal nao instalado" }
  return { ok: true, metodo: "Edge TTS Neural (pt-BR-FranciscaNeural)" }
}

module.exports = { falar, testar, gerarAudio }