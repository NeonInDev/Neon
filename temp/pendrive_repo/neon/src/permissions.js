const fs = require("fs")
const path = require("path")
const { log } = require("./logger")

const OWNER_ID = "1442928336329379925"
const RATE_LIMIT = 5
const RATE_WINDOW = 10000

const requestCounts = new Map()
const AUDIT_LOG = path.join(__dirname, "..", "logs", "audit.log")

try {
  const dir = path.dirname(AUDIT_LOG)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
} catch {}

function permitido(userId) {
  return userId === OWNER_ID
}

function verificarRateLimit(userId) {
  const agora = Date.now()
  if (!requestCounts.has(userId)) {
    requestCounts.set(userId, { count: 1, inicio: agora })
    return { permitido: true, tempoRestante: 0 }
  }
  const entry = requestCounts.get(userId)
  if (agora - entry.inicio > RATE_WINDOW) {
    requestCounts.set(userId, { count: 1, inicio: agora })
    return { permitido: true, tempoRestante: 0 }
  }
  entry.count++
  if (entry.count > RATE_LIMIT) {
    const tempoRestante = RATE_WINDOW - (agora - entry.inicio)
    return { permitido: false, tempoRestante }
  }
  return { permitido: true, tempoRestante: 0 }
}

function auditar(userId, username, comando, resultado) {
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19)
  const line = `[${timestamp}] [${userId}] ${username}: "${comando}" -> ${resultado?.slice(0, 100) || "N/A"}\n`
  try {
    fs.appendFileSync(AUDIT_LOG, line, "utf8")
  } catch (err) {
    log("WARN", "[AUDIT] Falha ao escrever", { erro: err.message })
  }
}

function lerAudit(linhas = 20) {
  try {
    if (!fs.existsSync(AUDIT_LOG)) return []
    const content = fs.readFileSync(AUDIT_LOG, "utf8")
    const allLines = content.trim().split("\n").filter(Boolean)
    return allLines.slice(-linhas)
  } catch { return [] }
}

function limparRateLimit(userId) {
  requestCounts.delete(userId)
}

module.exports = { permitido, verificarRateLimit, auditar, lerAudit, limparRateLimit, OWNER_ID }
