const { log } = require("./logger")
const { exec: execCb } = require("child_process")
const { promisify } = require("util")
const fs = require("fs")
const path = require("path")
const execAsync = promisify(execCb)
const TMP = process.env.TEMP || "C:\\Temp"

let edgeTts = null
try { edgeTts = require("edge-tts-universal") } catch {}

const VOZ_PT_BR = "pt-BR-FranciscaNeural"
const VOZ_EN = "en-US-JennyNeural"

async function falar(texto, voz = "auto") {
  if (!texto) return
  const t = texto.slice(0, 500)
  if (edgeTts) {
    try {
      const audio = await edgeTts.Communicate(t, voz === "auto" ? VOZ_PT_BR : voz)
      const buffer = await audio.stream()
      const tmpFile = path.join(TMP, `neon_tts_${Date.now()}.mp3`)
      fs.writeFileSync(tmpFile, buffer)
      const ps = `(New-Object Media.SoundPlayer '${tmpFile.replace(/'/g, "''")}').PlaySync()`
      await execAsync(`powershell -NoProfile -Command "${ps}"`, { timeout: 60000, windowsHide: true })
      fs.unlink(tmpFile, () => {})
      return
    } catch (e) {
      log("WARN", "Edge-TTS falhou, caindo pra Windows TTS", { erro: e.message })
    }
  }
  await falarWindows(t)
}

async function falarWindows(texto) {
  const safe = texto.replace(/'/g, "''").replace(/"/g, '""')
  const cmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Speech; ` +
    `try { ` +
    `  $$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
    `  $$v = $$s.GetInstalledVoices() | Where-Object { $$_.VoiceInfo.Culture.Name -eq 'pt-BR' } | Select-Object -First 1; ` +
    `  if ($$v) { $$s.SelectVoice($$v.VoiceInfo.Name) }; ` +
    `  $$s.Rate = -1; $$s.Volume = 100; ` +
    `  $$s.Speak('${safe}') ` +
    `} catch { (New-Object -ComObject Sapi.SpVoice).Speak('${safe}') }"`
  await execAsync(cmd, { timeout: 30000 }).catch(() => {})
}

async function testar() {
  if (!edgeTts) return { ok: false, motivo: "edge-tts-universal nao instalado" }
  try {
    const vozes = await edgeTts.listVoices()
    const pt = vozes.filter(v => v.Locale && v.Locale.startsWith("pt"))
    return { ok: true, vozes: pt.map(v => v.ShortName || v.Name) }
  } catch (e) {
    return { ok: false, motivo: e.message }
  }
}

module.exports = { falar, testar, VOZ_PT_BR, VOZ_EN }