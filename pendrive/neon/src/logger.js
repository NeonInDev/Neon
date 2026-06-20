const fs = require("fs")
const path = require("path")
const zlib = require("zlib")

const MAX_LOGS = 500
const buffer = []
const LOG_DIR = path.join(__dirname, "..", "logs")
const LOG_FILE = path.join(LOG_DIR, "neon.log")
const MAX_LOG_SIZE = 5 * 1024 * 1024

let nivelLog = process.env.LOG_LEVEL || "DEBUG"
const niveis = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }
let writeStream = null

try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
  writeStream = fs.createWriteStream(LOG_FILE, { flags: "a" })
} catch {}

function rotacionar() {
  try {
    if (!fs.existsSync(LOG_FILE)) return
    const stat = fs.statSync(LOG_FILE)
    if (stat.size < MAX_LOG_SIZE) return
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    const rotatedName = `neon_${timestamp}.log.gz`
    const rotatedPath = path.join(LOG_DIR, rotatedName)
    const content = fs.readFileSync(LOG_FILE)
    zlib.gzipSync(content)
    fs.writeFileSync(rotatedPath, zlib.gzipSync(content))
    fs.truncateSync(LOG_FILE, 0)
    const arquivos = fs.readdirSync(LOG_DIR).filter(f => f.startsWith("neon_") && f.endsWith(".log.gz"))
    if (arquivos.length > 10) {
      arquivos.sort().slice(0, arquivos.length - 10).forEach(f => {
        try { fs.unlinkSync(path.join(LOG_DIR, f)) } catch {}
      })
    }
  } catch {}
}

function log(level, msg, extra) {
  if (niveis[level] === undefined || niveis[level] < niveis[nivelLog]) return
  const agora = new Date().toISOString().replace("T", " ").slice(0, 19)
  const line = `[${agora}] [${level}] ${msg}${extra ? ` ${JSON.stringify(extra)}` : ""}`
  console.log(line)
  const entry = { time: agora, level, message: msg, extra }
  buffer.push(entry)
  if (buffer.length > MAX_LOGS) buffer.splice(0, buffer.length - MAX_LOGS)
  if (writeStream) {
    writeStream.write(line + "\n")
    rotacionar()
  }
  try {
    const { getBroadcast } = require("./docs/server")
    getBroadcast()("log", entry)
  } catch {}
}

function getLogs(nivel = null) {
  if (!nivel) return buffer.slice()
  return buffer.filter(l => niveis[l.level] >= niveis[nivel])
}

function setLevel(nivel) {
  if (niveis[nivel] !== undefined) nivelLog = nivel
}

function getLogFiles() {
  try {
    if (!fs.existsSync(LOG_DIR)) return []
    return fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith("neon") && (f.endsWith(".log") || f.endsWith(".gz")))
      .sort()
      .reverse()
  } catch { return [] }
}

async function fechar() {
  if (writeStream) {
    return new Promise(resolve => writeStream.end(resolve))
  }
}

module.exports = { log, getLogs, setLevel, getLogFiles, fechar, niveis }
