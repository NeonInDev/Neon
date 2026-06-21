const { log } = require("./logger")
const fs = require("fs")
const path = require("path")
const axios = require("axios")
const pc = require("./pc")

const TEMP_DIR = path.join(__dirname, "..", "temp")
const EXTENSOES_AUDIO = [".ogg", ".mp3", ".mp4", ".m4a", ".wav", ".webm"]
const MODELO_WHISPER = process.env.WHISPER_MODEL || "Xenova/whisper-small"
const IDIOMA_AUDIO = process.env.WHISPER_LANGUAGE || "pt"
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_WHISPER_MODEL = "whisper-large-v3-turbo"
const TRANSCRIPTION_TIMEOUT = 30000

function isAudioAnexo(msg) {
  if (!msg.attachments || msg.attachments.size === 0) return false
  for (const [, att] of msg.attachments) {
    const ext = path.extname(att.name || "").toLowerCase()
    if (EXTENSOES_AUDIO.includes(ext) || att.contentType?.startsWith("audio/")) {
      return att
    }
  }
  return false
}

async function baixarAudio(att, msgId) {
  fs.mkdirSync(TEMP_DIR, { recursive: true })
  const ext = path.extname(att.name || ".ogg") || ".ogg"
  const caminho = path.join(TEMP_DIR, `audio_${msgId}${ext}`)
  const r = await axios({ url: att.url, responseType: "arraybuffer", timeout: 30000 })
  fs.writeFileSync(caminho, r.data)
  log("INFO", "[AUDIO] Audio baixado", { nome: att.name, tamanho: r.data.length, ext })
  return caminho
}

let whisperPipeline = null

async function getWhisper() {
  if (!whisperPipeline) {
    log("INFO", "[AUDIO] Carregando Whisper", { modelo: MODELO_WHISPER })
    const { pipeline } = require("@xenova/transformers")
    whisperPipeline = await pipeline("automatic-speech-recognition", MODELO_WHISPER, {
      quantized: true,
    })
    log("INFO", "[AUDIO] Whisper carregado!")
  }
  return whisperPipeline
}

async function converterParaWav(inputPath) {
  const outputPath = inputPath.replace(/\.[^.]+$/, "") + "_conv.wav"
  try {
    const { execSync } = require("child_process")
    execSync(`"C:\\ffmpeg\\ffmpeg.exe" -i "${inputPath}" -ar 16000 -ac 1 -sample_fmt s16 "${outputPath}" -y`, {
      timeout: 30000, windowsHide: true, stdio: "pipe"
    })
    if (fs.existsSync(outputPath)) return outputPath
    log("WARN", "[AUDIO] ffmpeg nao gerou arquivo de saida")
    return null
  } catch (err) {
    log("WARN", "[AUDIO] ffmpeg falhou na conversao", { erro: err.message?.slice(0, 100) })
    return null
  }
}

function lerWavSamples(wavBuf) {
  // Encontra o chunk "data" no WAV (nao assume header de 44 bytes)
  let dataOffset = 12 // pula RIFF header + size + WAVE
  while (dataOffset + 8 <= wavBuf.length) {
    const chunkId = wavBuf.toString("ascii", dataOffset, dataOffset + 4)
    const chunkSize = wavBuf.readUInt32LE(dataOffset + 4)
    if (chunkId === "data") {
      const sampleStart = dataOffset + 8
      const numSamples = Math.floor(chunkSize / 2)
      const samples = new Float32Array(numSamples)
      for (let i = 0; i < numSamples; i++) {
        const s = wavBuf.readInt16LE(sampleStart + i * 2)
        samples[i] = s / 32768.0
      }
      return samples
    }
    dataOffset += 8 + chunkSize
  }
  throw new Error("Chunk data nao encontrado no WAV")
}

async function transcreverComGroq(wavPath) {
  if (!GROQ_API_KEY) return null
  try {
    log("INFO", "[AUDIO] Groq Whisper...")
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT)
    const blob = new Blob([fs.readFileSync(wavPath)], { type: "audio/wav" })
    const form = new FormData()
    form.append("file", blob, "audio.wav")
    form.append("model", GROQ_WHISPER_MODEL)
    form.append("language", IDIOMA_AUDIO)
    form.append("response_format", "json")
    const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: form,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "")
      log("WARN", "[AUDIO] Groq HTTP", { status: resp.status, erro: errText.slice(0, 100) })
      return null
    }
    const data = await resp.json()
    const texto = data?.text?.trim()
    if (texto) log("INFO", "[AUDIO] Groq OK", { texto: texto.slice(0, 100) })
    return texto || null
  } catch (err) {
    log("WARN", "[AUDIO] Groq erro", { erro: err.message?.slice(0, 100) })
    return null
  }
}

async function transcreverComLocal(wavPath) {
  try {
    log("INFO", "[AUDIO] Whisper local...")
    const transcriber = await getWhisper()
    const wavBuf = fs.readFileSync(wavPath)
    const samples = lerWavSamples(wavBuf)
    log("INFO", "[AUDIO] Whisper processando", { amostras: samples.length })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT)
    const result = await transcriber(samples, { language: IDIOMA_AUDIO, task: "transcribe" })
    clearTimeout(timeout)
    const texto = result?.text?.trim()
    if (texto) log("INFO", "[AUDIO] Whisper local OK", { texto: texto.slice(0, 100) })
    return texto || null
  } catch (err) {
    log("ERROR", "[AUDIO] Whisper local erro", { erro: err.message?.slice(0, 150) })
    return null
  }
}

async function transcreverAudio(caminhoAudio) {
  const wavPath = await converterParaWav(caminhoAudio)
  if (!wavPath) return null
  try {
    let texto = await transcreverComGroq(wavPath)
    if (!texto) texto = await transcreverComLocal(wavPath)
    return texto
  } finally {
    try { fs.unlinkSync(wavPath) } catch {}
  }
}

async function processarAudioMessage(msg) {
  const att = isAudioAnexo(msg)
  if (!att) return false

  const authorId = msg.author.id
  const authorName = msg.author.username
  log("INFO", "[AUDIO] Voice message detectada", { autor: authorName, nome: att.name, tamanho: att.size })
  await msg.channel.sendTyping()

  let caminhoAudio
  try {
    caminhoAudio = await baixarAudio(att, msg.id)
  } catch (err) {
    log("ERROR", "[AUDIO] Download falhou", { erro: err.message })
    await msg.reply("Nao consegui baixar o audio.")
    return true
  }

  const texto = await transcreverAudio(caminhoAudio)
  try { fs.unlinkSync(caminhoAudio) } catch {}

  if (!texto) {
    await msg.reply("Nao consegui entender o audio. Tenta de novo?")
    return true
  }

  const { db } = require("./db")
  const mestre = db.data.users?.[authorId]?.mestre || false

  const { executarAcao } = require("./actions")
  const acao = await executarAcao(texto, mestre, authorId, msg)
  if (acao && !acao.startsWith("❌")) {
    const { add: addContexto } = require("./contexto")
    addContexto(authorId, authorName, texto, acao)
    await msg.reply(acao)
    try { await pc.tts(acao.replace(/[*_~`]/g, "").slice(0, 200)) } catch {}
    return true
  }

  const { askNeon } = require("./ai")
  const reply = await askNeon(authorId, authorName, texto)
  const { add: addContexto } = require("./contexto")
  addContexto(authorId, authorName, texto, reply)
  await msg.reply(reply)
  try { await pc.tts(reply.replace(/[*_~`]/g, "").slice(0, 200)) } catch {}
  return true
}

module.exports = { processarAudioMessage, isAudioAnexo }