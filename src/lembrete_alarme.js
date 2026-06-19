const { log } = require("./logger")
const path = require("path")
const fs = require("fs")

const ALARMES_PATH = path.join(__dirname, "..", "alarmes.json")
const SOM_PADRAO = path.join(__dirname, "..", "assets", "alarme.wav")
const { exec } = require("child_process")
const { promisify } = require("util")
const execAsync = promisify(exec)

let alarmes = []
let timer = null

function carregar() {
  try {
    if (fs.existsSync(ALARMES_PATH)) {
      alarmes = JSON.parse(fs.readFileSync(ALARMES_PATH, "utf8"))
    }
  } catch { alarmes = [] }
}

function salvar() {
  try {
    fs.writeFileSync(ALARMES_PATH, JSON.stringify(alarmes, null, 2), "utf8")
  } catch (err) {
    log("WARN", "[ALARME] Erro ao salvar", { erro: err.message })
  }
}

function criar(dataHora, mensagem, userId) {
  const alarme = {
    id: `${userId}_${Date.now()}`,
    userId,
    mensagem,
    dataHora: new Date(dataHora).toISOString(),
    criado: new Date().toISOString(),
    ativo: true,
    disparado: false
  }
  alarmes.push(alarme)
  salvar()
  log("INFO", "[ALARME] Criado", { id: alarme.id, dataHora, mensagem: mensagem.slice(0, 50) })
  return alarme
}

function listar(userId = null) {
  if (userId) return alarmes.filter(a => a.userId === userId && a.ativo && !a.disparado)
  return alarmes.filter(a => a.ativo && !a.disparado)
}

function cancelar(id) {
  const idx = alarmes.findIndex(a => a.id === id)
  if (idx < 0) return false
  alarmes[idx].ativo = false
  salvar()
  return true
}

function cancelarTodos(userId) {
  let count = 0
  for (const a of alarmes) {
    if (a.userId === userId && a.ativo) { a.ativo = false; count++ }
  }
  if (count) salvar()
  return count
}

async function disparar(alarme) {
  alarme.disparado = true
  alarme.ativo = false
  salvar()
  log("INFO", "[ALARME] Disparado!", { id: alarme.id, mensagem: alarme.mensagem?.slice(0, 50) })
  try {
    if (fs.existsSync(SOM_PADRAO)) {
      await execAsync(`powershell -Command "(New-Object Media.SoundPlayer '${SOM_PADRAO}').PlaySync()"`, { timeout: 30000 })
    } else {
      for (let i = 0; i < 3; i++) {
        process.stdout.write("\x07")
        await new Promise(r => setTimeout(r, 500))
      }
    }
  } catch {}
  return alarme
}

async function verificar() {
  const agora = new Date()
  for (const alarme of alarmes) {
    if (!alarme.ativo || alarme.disparado) continue
    if (new Date(alarme.dataHora) <= agora) {
      await disparar(alarme)
    }
  }
}

function iniciar() {
  carregar()
  if (timer) clearInterval(timer)
  timer = setInterval(verificar, 10000)
  log("INFO", "[ALARME] Monitor iniciado (check a cada 10s)")
}

function parar() {
  if (timer) { clearInterval(timer); timer = null }
}

module.exports = { criar, listar, cancelar, cancelarTodos, iniciar, parar, carregar }
