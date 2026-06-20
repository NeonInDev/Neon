const { log } = require("./logger")
const fs = require("fs")
const path = require("path")
const axios = require("axios")
const pc = require("./pc")

const TEMP_DIR = path.join(__dirname, "..", "temp")
const EXTENSOES_AUDIO = [".ogg", ".mp3", ".mp4", ".m4a", ".wav", ".webm"]
const MODELO_WHISPER = process.env.WHISPER_MODEL || "Xenova/whisper-small"

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

async function transcreverAudio(caminhoAudio) {
  try {
    log("INFO", "[AUDIO] Transcrevendo com Whisper...")
    const transcriber = await getWhisper()
    const wavPath = await converterParaWav(caminhoAudio)
    if (!wavPath) return null
    const wavBuf = fs.readFileSync(wavPath)
    const samples = lerWavSamples(wavBuf)
    try { fs.unlinkSync(wavPath) } catch {}
    log("INFO", "[AUDIO] Whisper processando", { amostras: samples.length })
    const result = await transcriber(samples, { language: "pt", task: "transcribe" })
    const texto = result?.text?.trim()
    if (texto && texto.length > 0) {
      log("INFO", "[AUDIO] Whisper OK", { texto: texto.slice(0, 100) })
      return texto
    }
    log("WARN", "[AUDIO] Whisper retornou vazio")
    return null
  } catch (err) {
    log("ERROR", "[AUDIO] Whisper erro", { erro: err.message?.slice(0, 150) })
    return null
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