const fs = require("fs")
const path = require("path")
const { log } = require("./logger")

const PLUGINS_DIR = path.join(__dirname, "..", "plugins")
const carregados = []
const ferramentasExtras = []
const acoesExtras = []

function ensureDir() {
  if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true })
}

async function carregarTodos() {
  ensureDir()
  const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
  for (const entry of entries) {
    const pluginPath = path.join(PLUGINS_DIR, entry.name)
    let mod = null
    try {
      if (entry.isFile() && entry.name.endsWith(".js")) {
        mod = require(pluginPath)
      } else if (entry.isDirectory() && fs.existsSync(path.join(pluginPath, "index.js"))) {
        mod = require(path.join(pluginPath, "index.js"))
      }
      if (!mod || !mod.nome) continue
      if (mod.iniciar) await mod.iniciar()
      carregados.push(mod)
      if (mod.ferramentas) ferramentasExtras.push(...mod.ferramentas)
      if (mod.acoes) acoesExtras.push(...mod.acoes)
      log("INFO", `[PLUGIN] Carregado: ${mod.nome} v${mod.versao || "1.0"}`)
    } catch (e) {
      log("WARN", `[PLUGIN] Erro ao carregar ${entry.name}`, { erro: e.message })
    }
  }
  log("INFO", `[PLUGIN] Total: ${carregados.length} plugins, ${ferramentasExtras.length} ferramentas, ${acoesExtras.length} acoes`)
}

async function pararTodos() {
  for (const mod of carregados) {
    if (mod.parar) await mod.parar()
  }
}

function getFerramentas() {
  return ferramentasExtras
}

function getAcoes() {
  return acoesExtras
}

module.exports = { carregarTodos, pararTodos, getFerramentas, getAcoes }