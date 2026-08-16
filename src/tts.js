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

const { geminiTTS, temApiKey: temGeminiKey } = require("./gemini_tts")

const EMOJIS = /[\p{Extended_Pictographic}\u200d\uFE0F]/gu

function limparFala(texto) {
  return (texto || "").replace(/[*_`~#|\[\]]/g, "").replace(EMOJIS, "").slice(0, 500)
}

async function gerarAudio(texto, voz = "auto") {
  if (!texto) return null;
  const t = limparFala(texto);

  // Tenta Gemini primeiro (qualidade superior)
  if (temGeminiKey()) {
    const geminiPath = await geminiTTS(t, voz);
    if (geminiPath) return geminiPath;
  }

  // Fallback: Edge TTS
  if (edgeTts) {
    const voice = voz === "auto" ? "pt-BR-FranciscaNeural" : voz;
    const tts = new edgeTts.UniversalEdgeTTS(t, voice);
    const result = await tts.synthesize();
    const mp3Buffer = Buffer.from(await result.audio.arrayBuffer());
    const ts = Date.now();
    const mp3File = path.join(TMP, `neon_tts_${ts}.mp3`);
    fs.writeFileSync(mp3File, mp3Buffer);
    return mp3File;
  }

  return null;
}

async function falar(texto, voz = "auto") {
  if (!texto) return
  const t = limparFala(texto)

  // Tenta Gemini TTS primeiro
  if (temGeminiKey()) {
    try {
      const wavPath = await geminiTTS(t, voz);
      if (wavPath) {
        const safe = wavPath.replace(/'/g, "''")
        await execAsync(`powershell -NoProfile -Command "(New-Object Media.SoundPlayer '${safe}').PlaySync()"`, { timeout: 60000, windowsHide: true })
        fs.unlink(wavPath, () => {})
        return
      }
    } catch (e) {
      log("WARN", "Gemini TTS falhou, tentando Edge", { erro: e.message })
    }
  }

  // Fallback: Edge TTS
  if (edgeTts) {
    try {
      const mp3 = await gerarAudio(t, voz)
      if (mp3 && mp3.endsWith('.mp3')) {
        const ts = Date.now()
        const wavFile = path.join(TMP, `neon_tts_${ts}.wav`)
        await execAsync(`"${FFMPEG}" -y -i "${mp3}" -f wav "${wavFile}"`, { timeout: 30000, windowsHide: true })
        fs.unlink(mp3, () => {})
        const safe = wavFile.replace(/'/g, "''")
        await execAsync(`powershell -NoProfile -Command "(New-Object Media.SoundPlayer '${safe}').PlaySync()"`, { timeout: 60000, windowsHide: true })
        fs.unlink(wavFile, () => {})
        return
      }
    } catch (e) {
      log("WARN", "Edge TTS falhou, caindo pra fallback", { erro: e.message })
    }
  }

  // Fallback final: Windows SAPI
  const safe = t.replace(/'/g, "''").replace(/"/g, '""')
  const fallback = `powershell -NoProfile -Command "(New-Object -ComObject Sapi.SpVoice).Speak('${safe}')"`
  await execAsync(fallback, { timeout: 15000, windowsHide: true }).catch(() => {})
}

async function testar() {
  if (temGeminiKey()) return { ok: true, metodo: "Gemini TTS (Google)" }
  if (edgeTts) return { ok: true, metodo: "Edge TTS Neural (pt-BR-FranciscaNeural)" }
  return { ok: false, motivo: "Nenhum TTS disponível" }
}

module.exports = { falar, testar, gerarAudio }