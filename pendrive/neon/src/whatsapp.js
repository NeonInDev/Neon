const { log } = require("./logger")
const path = require("path")

let cliente = null
let qrCode = null
let pronto = false
let sessaoPath = path.join(__dirname, "..", "whatsapp_session")

function getClient() {
  if (cliente) return cliente
  try {
    const { Client, LocalAuth } = require("whatsapp-web.js")
    cliente = new Client({
      authStrategy: new LocalAuth({ dataPath: sessaoPath }),
      puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
    })
    cliente.on("qr", (qr) => {
      qrCode = qr
      log("INFO", "[WHATSAPP] QR Code gerado (escaneie com o WhatsApp)")
    })
    cliente.on("ready", () => {
      pronto = true
      qrCode = null
      log("INFO", "[WHATSAPP] Cliente pronto!")
    })
    cliente.on("disconnected", (reason) => {
      pronto = false
      log("WARN", "[WHATSAPP] Desconectado", { motivo: reason })
    })
    cliente.on("auth_failure", (msg) => {
      pronto = false
      log("ERROR", "[WHATSAPP] Falha autenticacao", { msg })
    })
    cliente.initialize().catch(err => {
      log("ERROR", "[WHATSAPP] Init falhou", { erro: err.message })
    })
    return cliente
  } catch (err) {
    log("WARN", "[WHATSAPP] whatsapp-web.js nao disponivel", { erro: err.message })
    return null
  }
}

async function iniciar() {
  return getClient()
}

async function enviar(contato, mensagem) {
  const client = getClient()
  if (!client) return { ok: false, erro: "whatsapp-web.js nao instalado. Rode: npm install whatsapp-web.js" }
  if (!pronto) {
    if (qrCode) return { ok: false, erro: "WhatsApp nao autenticado. Escaneie o QR Code.", qr: qrCode }
    return { ok: false, erro: "WhatsApp ainda conectando..." }
  }
  try {
    const numeroFormatado = contato.replace(/[^0-9]/g, "")
    const chatId = numeroFormatado.includes("@c.us") ? numeroFormatado : `${numeroFormatado}@c.us`
    await client.sendMessage(chatId, mensagem)
    log("INFO", "[WHATSAPP] Mensagem enviada", { contato, tamanho: mensagem.length })
    return { ok: true, mensagem: `WhatsApp enviado para ${contato}` }
  } catch (err) {
    log("WARN", "[WHATSAPP] Erro ao enviar", { contato, erro: err.message })
    return { ok: false, erro: err.message }
  }
}

async function status() {
  if (!cliente) return { conectado: false, motivo: "Nao inicializado" }
  return { conectado: pronto, qr: qrCode, sessao: sessaoPath }
}

async function parar() {
  if (cliente) {
    try { await cliente.destroy() } catch {}
    cliente = null
    pronto = false
  }
}

module.exports = { iniciar, enviar, status, parar }
