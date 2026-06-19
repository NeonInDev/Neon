const { log } = require("./logger")
const fs = require("fs")
const path = require("path")
const axios = require("axios")
const pc = require("./pc")

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

// Tenta transcrever com Gemini via REST API (mais confiavel que SDK para audio)
async function transcreverGeminiRest(caminhoAudio) {
  const key = getApiKey()
  if (!key) return null

  const audioBuf = fs.readFileSync(caminhoAudio)
  const ext = path.extname(caminhoAudio).toLowerCase()
  const mimeMap = {
    ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".mp4": "audio/mp4",
    ".m4a": "audio/mp4", ".wav": "audio/wav", ".webm": "audio/webm"
  }
  const mime = mimeMap[ext] || "audio/ogg"
  const b64 = audioBuf.toString("base64")

  try {
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        contents: [{
          parts: [
            { inline_data: { mime_type: mime, data: b64 } },
            { text: "Transcreva EXATAMENTE o que foi dito neste audio em portugues (Brasil). Retorne APENAS a transcricao." }
          ]
        }]
      },
      { timeout: 30000, headers: { "Content-Type": "application/json" } }
    )

    const texto = r.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (texto) {
      log("INFO", "[AUDIO] Transcricao Gemini", { texto: texto.slice(0, 100) })
      return texto
    }
    log("WARN", "[AUDIO] Gemini resposta vazia", { raw: JSON.stringify(r.data).slice(0, 200) })
    return null
  } catch (err) {
    const detalhe = err.response?.data?.error?.message || err.message
    log("ERROR", "[AUDIO] Gemini REST falhou", { erro: detalhe })
    return null
  }
}

async function transcreverAudio(caminhoAudio) {
  // Tenta Gemini primeiro
  const texto = await transcreverGeminiRest(caminhoAudio)
  if (texto) return texto

  // Fallback: tenta com o SDK
  try {
    const key = getApiKey()
    if (!key) return null
    const { GoogleGenerativeAI } = require("@google/generative-ai")
    const genAI = new GoogleGenerativeAI(key)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })
    const audioBuf = fs.readFileSync(caminhoAudio)
    const ext = path.extname(caminhoAudio).toLowerCase()
    const mimeMap = {
      ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".mp4": "audio/mp4",
      ".m4a": "audio/mp4", ".wav": "audio/wav", ".webm": "audio/webm"
    }
    const mime = mimeMap[ext] || "audio/ogg"
    const result = await model.generateContent([
      { inlineData: { mimeType: mime, data: audioBuf.toString("base64") } },
      { text: "Transcreva o audio em pt-BR. Retorne APENAS a transcricao." }
    ])
    const t = result.response.text().trim()
    if (t) { log("INFO", "[AUDIO] Transcricao SDK", { texto: t.slice(0, 100) }); return t }
  } catch (err) {
    log("ERROR", "[AUDIO] SDK tambem falhou", { erro: err.message })
  }

  return null
}

async function processarAudioMessage(msg) {
  const att = isAudioAnexo(msg)
  if (!att) return false

  const authorId = msg.author.id
  const authorName = msg.author.username
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
    await msg.reply("Nao consegui entender o audio. Tenta de novo? (certifique-se de falar claramente em portugues)")
    return true
  }

  await msg.reply(`Entendi: "${texto}"`)

  const { executarAcao } = require("./actions")
  const acao = await executarAcao(texto, true, authorId)
  if (acao) {
    await msg.reply(acao)
    try { await pc.tts(acao.replace(/[*_~`]/g, "").slice(0, 200)) } catch {}
    return true
  }

  const { askNeon } = require("./ai")
  const reply = await askNeon(authorId, authorName, texto)
  await msg.reply(reply)
  try { await pc.tts(reply.replace(/[*_~`]/g, "").slice(0, 200)) } catch {}
  return true
}

module.exports = { processarAudioMessage, isAudioAnexo }
