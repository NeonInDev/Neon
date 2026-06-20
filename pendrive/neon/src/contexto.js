const { log } = require("./logger")

const conversas = new Map()
const MAX_MSG = 10

function add(userId, username, userMsg, botReply) {
  if (!userId) return
  if (!conversas.has(userId)) {
    conversas.set(userId, [])
  }
  const historico = conversas.get(userId)
  historico.push({
    id: `${userId}_${Date.now()}`,
    userId,
    username,
    userMsg,
    botReply,
    timestamp: new Date().toISOString()
  })
  if (historico.length > MAX_MSG) {
    historico.splice(0, historico.length - MAX_MSG)
  }
  log("DEBUG", "[CONTEXTO] Msg adicionada", { userId, username, tamanho: historico.length })
}

function get(userId) {
  return conversas.get(userId) || []
}

function formatarParaPrompt(userId) {
  const historico = get(userId)
  if (!historico.length) return ""
  return historico.map(m =>
    `Usuario: ${m.userMsg}\nNeon: ${m.botReply}`
  ).join("\n\n")
}

function limpar(userId) {
  conversas.delete(userId)
  log("DEBUG", "[CONTEXTO] Historico limpo", { userId })
}

function estatisticas() {
  let total = 0
  for (const [, h] of conversas) total += h.length
  return { totalUsuarios: conversas.size, totalMensagens: total }
}

module.exports = { add, get, formatarParaPrompt, limpar, estatisticas }
