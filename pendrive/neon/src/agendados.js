const { log } = require("./logger")
const { askNeon } = require("./ai")
const { executarAcao } = require("./actions")
const path = require("path")
const fs = require("fs")

const ARQUIVO = path.join(__dirname, "..", "agendados.json")
let timer = null
let running = false

function carregar() {
  try {
    if (fs.existsSync(ARQUIVO)) return JSON.parse(fs.readFileSync(ARQUIVO, "utf8"))
  } catch {}
  return []
}

function salvar(tarefas) {
  fs.writeFileSync(ARQUIVO, JSON.stringify(tarefas, null, 2), "utf8")
}

function parseCron(str) {
  const p = str.split(/\s+/)
  if (p.length !== 5) return null
  const m = p[0], h = p[1], d = p[2], M = p[3], w = p[4]
  return { minuto: m, hora: h, dia: d, mes: M, semana: w }
}

function matchCron(cron, agora) {
  function matchVal(v, val) {
    if (v === "*") return true
    const partes = v.split(",")
    for (const p of partes) {
      if (p.includes("/")) {
        const [, step] = p.split("/")
        if (val % parseInt(step) === 0) return true
      } else if (p.includes("-")) {
        const [a, b] = p.split("-")
        if (val >= parseInt(a) && val <= parseInt(b)) return true
      } else if (parseInt(p) === val) return true
    }
    return false
  }
  return matchVal(cron.minuto, agora.getMinutes()) &&
         matchVal(cron.hora, agora.getHours()) &&
         matchVal(cron.dia, agora.getDate()) &&
         matchVal(cron.mes, agora.getMonth() + 1) &&
         matchVal(cron.semana, agora.getDay())
}

async function verificar() {
  const tarefas = carregar()
  if (!tarefas.length) return
  const agora = new Date()
  const agoraStr = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`
  for (const t of tarefas) {
    const cron = parseCron(t.cron)
    if (!cron) continue
    const ultExec = t.ultimaExecucao || ""
    if (ultExec === agoraStr) continue
    if (matchCron(cron, agora)) {
      log("INFO", `[AGENDADO] Executando: ${t.nome}`)
      t.ultimaExecucao = agoraStr
      salvar(tarefas)
      try {
        if (t.acao === "comando") {
          const reply = await executarAcao(t.comando, true, t.userId || "1442928336329379925")
          if (t.notificar && reply) {
            log("INFO", `[AGENDADO] Resultado de "${t.nome}": ${reply}`)
          }
        } else if (t.acao === "pergunta") {
          const reply = await askNeon(t.userId || "1442928336329379925", "sistema", t.pergunta)
          log("INFO", `[AGENDADO] Resposta de "${t.nome}": ${reply}`)
        }
      } catch (err) {
        log("ERROR", `[AGENDADO] Erro em "${t.nome}": ${err.message}`)
      }
    }
  }
}

async function verificarCadaMinuto() {
  if (running) return
  running = true
  timer = setInterval(verificar, 60000)
  await verificar()
}

function parar() {
  running = false
  if (timer) clearInterval(timer)
}

module.exports = { verificarCadaMinuto, parar }
