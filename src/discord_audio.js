const { log } = require("./logger")
const fs = require("fs")
const path = require("path")
const axios = require("axios")
const { GoogleGenerativeAI } = require("@google/generative-ai")
const pc = require("./pc")
const { executarAcao } = require("./actions")

const TEMP_DIR = path.join(__dirname, "..", "temp")
const EXTENSOES_AUDIO = [".ogg", ".mp3", ".mp4", ".m4a", ".wav", ".webm"]

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
  log("INFO", "[AUDIO] Audio baixado", { nome: att.name, tamanho: r.data.length })
  return caminho
}

function getApiKey() {
  try {
    const envPath = path.join(__dirname, "..", ".env")
    if (fs.existsSync(envPath)) {
      const env = fs.readFileSync(envPath, "utf8")
      const m = env.match(/GEMINI_API_KEY=(.+)/)
      if (m) return m[1].trim()
    }
  } catch {}
  return process.env.GEMINI_API_KEY
}

async function transcreverAudio(caminhoAudio) {
  const key = getApiKey()
  if (!key) { log("WARN", "[AUDIO] Sem GEMINI_API_KEY"); return null }

  try {
    const genAI = new GoogleGenerativeAI(key)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

    const audioBuf = fs.readFileSync(caminhoAudio)
    const mimeMap = {
      ".ogg": "audio/ogg",
      ".mp3": "audio/mpeg",
      ".mp4": "audio/mp4",
      ".m4a": "audio/mp4",
      ".wav": "audio/wav",
      ".webm": "audio/webm"
    }
    const ext = path.extname(caminhoAudio).toLowerCase()
    const mime = mimeMap[ext] || "audio/ogg"

    const prompt = "Transcreva EXATAMENTE o que foi dito neste audio em portugues (Brasil). Retorne APENAS a transcricao, sem explicacoes, sem aspas."
    const result = await model.generateContent([
      { inlineData: { mimeType: mime, data: audioBuf.toString("base64") } },
      { text: prompt }
    ])
    const texto = result.response.text().trim()
    log("INFO", "[AUDIO] Transcricao", { texto: texto.slice(0, 100) })
    return texto
  } catch (err) {
    log("ERROR", "[AUDIO] Erro ao transcrever", { erro: err.message })
    return null
  }
}

async function processarAudioMessage(msg) {
  const att = isAudioAnexo(msg)
  if (!att) return false

  const authorId = msg.author.id
  const authorName = msg.author.username

  // Sinaliza que esta ouvindo
  await msg.channel.sendTyping()

  const caminhoAudio = await baixarAudio(att, msg.id)
  const texto = await transcreverAudio(caminhoAudio)

  // Limpa audio temp
  try { fs.unlinkSync(caminhoAudio) } catch {}

  if (!texto) {
    await msg.reply("Nao consegui entender o audio. Tenta de novo?")
    return true
  }

  // Mostra transcricao
  await msg.reply(`Ouvindo: "${texto}"`)

  // Processa como comando
  const acao = await executarAcao(texto, true, authorId)
  if (acao) {
    await msg.reply(acao)
    try { await pc.tts(acao.replace(/[*_~`]/g, "").slice(0, 200)) } catch {}
    return true
  }

  // Pergunta pra IA
  const { askNeon } = require("./ai")
  const reply = await askNeon(authorId, authorName, texto)
  await msg.reply(reply)
  try { await pc.tts(reply.replace(/[*_~`]/g, "").slice(0, 200)) } catch {}
  return true
}

module.exports = { processarAudioMessage, isAudioAnexo }
