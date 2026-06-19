const fs = require("fs")
const path = require("path")
const { log } = require("./logger")

const ARQUIVO = path.join(__dirname, "..", "memoria_global.json")
const CATEGORIAS_PADRAO = ["pessoal", "preferencia", "config", "conhecimento", "lembrete", "outro"]

function carregar() {
  try {
    if (fs.existsSync(ARQUIVO)) return JSON.parse(fs.readFileSync(ARQUIVO, "utf8"))
  } catch {}
  return { memorias: [], expiradas: 0 }
}

function salvar(data) {
  fs.writeFileSync(ARQUIVO, JSON.stringify(data, null, 2), "utf8")
}

async function lembrar(chave, valor, categoria = "outro", prioridade = 3, expiracao = null) {
  const data = carregar()
  const idx = data.memorias.findIndex(m => m.chave.toLowerCase() === chave.toLowerCase())
  const entry = {
    chave, valor,
    categoria: CATEGORIAS_PADRAO.includes(categoria) ? categoria : "outro",
    prioridade: Math.min(5, Math.max(1, prioridade)),
    expira: expiracao,
    acessos: 0,
    criada: new Date().toISOString(),
    atualizada: new Date().toISOString()
  }
  if (idx >= 0) {
    entry.criada = data.memorias[idx].criada
    entry.acessos = data.memorias[idx].acessos || 0
    data.memorias[idx] = entry
  } else {
    data.memorias.push(entry)
  }
  salvar(data)
  log("INFO", "[MEMORIA] Lembrei", { chave, categoria, prioridade })
  return `Lembrei: "${chave}" (${categoria}, prioridade ${prioridade})`
}

async function esquecer(chave) {
  const data = carregar()
  const initial = data.memorias.length
  data.memorias = data.memorias.filter(m => m.chave.toLowerCase() !== chave.toLowerCase())
  if (data.memorias.length === initial) return `Nao lembro de nada sobre "${chave}".`
  salvar(data)
  return `Esqueci "${chave}".`
}

async function buscar(texto) {
  const data = carregar()
  const termo = texto.toLowerCase()
  const resultados = data.memorias.filter(m =>
    m.chave.toLowerCase().includes(termo) ||
    m.valor.toLowerCase().includes(termo) ||
    (m.categoria && m.categoria.toLowerCase().includes(termo))
  ).map(m => {
    m.acessos = (m.acessos || 0) + 1
    return m
  })
  salvar(data)
  return resultados.sort((a, b) => (b.prioridade || 3) - (a.prioridade || 3)).slice(0, 10)
}

async function buscarPorCategoria(categoria) {
  const data = carregar()
  return data.memorias.filter(m => m.categoria === categoria)
}

async function listar() {
  return carregar().memorias
}

async function limparExpiradas() {
  const data = carregar()
  const agora = new Date()
  const antes = data.memorias.length
  data.memorias = data.memorias.filter(m => {
    if (!m.expira) return true
    return new Date(m.expira) > agora
  })
  data.expiradas = (data.expiradas || 0) + (antes - data.memorias.length)
  salvar(data)
  return antes - data.memorias.length
}

async function estatisticas() {
  const data = carregar()
  const m = data.memorias
  const categorias = {}
  for (const mem of m) {
    const cat = mem.categoria || "outro"
    categorias[cat] = (categorias[cat] || 0) + 1
  }
  return {
    total: m.length,
    expiradas: data.expiradas || 0,
    categorias,
    alta_prioridade: m.filter(x => (x.prioridade || 3) >= 4).length
  }
}

function formatarParaPrompt() {
  const data = carregar()
  if (!data.memorias.length) return ""
  const importantes = data.memorias
    .sort((a, b) => (b.prioridade || 3) - (a.prioridade || 3))
    .slice(0, 30)
  const linhas = importantes.map(m =>
    `[${m.categoria || "outro"}] ${m.chave}: ${(m.valor || "").slice(0, 200)}`
  )
  return "Memorias:\n" + linhas.join("\n")
}

module.exports = { lembrar, esquecer, buscar, buscarPorCategoria, listar, limparExpiradas, estatisticas, formatarParaPrompt }