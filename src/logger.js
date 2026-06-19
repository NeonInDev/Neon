const MAX_LOGS = 500
const buffer = []

function log(level, msg, extra) {
  const agora = new Date().toISOString().replace("T", " ").slice(0, 19)
  const line = `[${agora}] [${level}] ${msg}${extra ? ` ${JSON.stringify(extra)}` : ""}`
  console.log(line)
  buffer.push({ time: agora, level, message: msg, extra })
  if (buffer.length > MAX_LOGS) buffer.splice(0, buffer.length - MAX_LOGS)
}

function getLogs() {
  return buffer.slice()
}

module.exports = { log, getLogs }