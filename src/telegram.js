const { log } = require("./logger")
const { askNeon } = require("./ai")
const { executarAcao } = require("./actions")

let polling = false
let offset = 0
const OWNER_ID = "1442928336329379925"

function getToken() {
  const t = process.env.TELEGRAM_TOKEN
  if (!t || t === "seu_token_aqui") return null
  return t
}

async function fazer(url, opts = {}) {
  const token = getToken()
  if (!token) return null
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${url}`, {
      headers: { "Content-Type": "application/json" },
      ...opts
    })
    return await r.json()
  } catch { return null }
}

async function processarMensagem(msg) {
  const chatId = msg.chat.id
  const text = (msg.text || "").trim()
  const fromId = msg.from?.id?.toString()
  if (!text) return

  if (text === "/start") {
    return fazer("sendMessage", {
      method: "POST",
      body: JSON.stringify({
        chat_id: chatId,
        text: "Neon aqui! Envie qualquer comando como se estivesse falando comigo no Discord.",
        parse_mode: "Markdown"
      })
    })
  }

  const acao = await executarAcao(text, true, fromId || OWNER_ID)
  if (acao) {
    return fazer("sendMessage", {
      method: "POST",
      body: JSON.stringify({ chat_id: chatId, text: acao, parse_mode: "Markdown" })
    })
  }

  const reply = await askNeon(fromId || OWNER_ID, "Telegram", text)
  return fazer("sendMessage", {
    method: "POST",
    body: JSON.stringify({ chat_id: chatId, text: reply, parse_mode: "Markdown" })
  })
}

async function iniciar() {
  const token = getToken()
  if (!token) {
    log("INFO", "[TELEGRAM] Token nao configurado (TELEGRAM_TOKEN no .env)")
    return false
  }
  polling = true
  log("INFO", "[TELEGRAM] Iniciando polling...")
  while (polling) {
    const data = await fazer(`getUpdates?offset=${offset}&timeout=30`, { signal: AbortSignal.timeout(35000) })
    if (data?.ok && data.result?.length) {
      for (const upd of data.result) {
        offset = upd.update_id + 1
        if (upd.message) await processarMensagem(upd.message)
      }
    }
    await new Promise(r => setTimeout(r, 100))
  }
}

async function parar() {
  polling = false
  log("INFO", "[TELEGRAM] Parado")
}

module.exports = { iniciar, parar }
