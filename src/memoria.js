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

async function lembrar(chave, valor, categoria = "outro", prioridade = 3, expiracao = null, guildId = null) {
  const data = carregar()
  const idx = data.memorias.findIndex(m => m.chave.toLowerCase() === chave.toLowerCase())
  const entry = {
    chave, valor,
    categoria: CATEGORIAS_PADRAO.includes(categoria) ? categoria : "outro",
    prioridade: Math.min(5, Math.max(1, prioridade)),
    expira: expiracao,
    guildId: guildId || null,
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
  log("INFO", "[MEMORIA] Lembrei", { chave, categoria, prioridade, guildId })
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

async function buscar(texto, guildId = null) {
  const data = carregar()
  const termo = texto.toLowerCase()
  const resultados = data.memorias.filter(m =>
    (!guildId || !m.guildId || m.guildId === guildId) &&
    (m.chave.toLowerCase().includes(termo) ||
    m.valor.toLowerCase().includes(termo) ||
    (m.categoria && m.categoria.toLowerCase().includes(termo)))
  ).map(m => {
    m.acessos = (m.acessos || 0) + 1
    return m
  })
  salvar(data)
  return resultados.sort((a, b) => (b.prioridade || 3) - (a.prioridade || 3)).slice(0, 10)
}

async function buscarPorCategoria(categoria, guildId = null) {
  const data = carregar()
  return data.memorias.filter(m => m.categoria === categoria && (!guildId || !m.guildId || m.guildId === guildId))
}

async function listar(guildId = null) {
  const data = carregar()
  if (!guildId) return data.memorias
  return data.memorias.filter(m => !m.guildId || m.guildId === guildId)
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

function formatarParaPrompt(guildId = null) {
  const data = carregar()
  const base = !guildId ? data.memorias : data.memorias.filter(m => !m.guildId || m.guildId === guildId)
  if (!base.length) return ""
  const importantes = base
    .sort((a, b) => (b.prioridade || 3) - (a.prioridade || 3))
    .slice(0, 30)
  const linhas = importantes.map(m =>
    `[${m.categoria || "outro"}] ${m.chave}: ${(m.valor || "").slice(0, 200)}`
  )
  return "Memorias:\n" + linhas.join("\n")
}

function buscarRelevantes(textoUsuario, guildId = null, maxItens = 8) {
  const data = carregar()
  if (!data.memorias.length) return ""
  const termos = textoUsuario.toLowerCase().split(/\s+/).filter(t => t.length > 2)
  const base = !guildId ? data.memorias : data.memorias.filter(m => !m.guildId || m.guildId === guildId)
  if (!base.length) return ""
  if (!termos.length) return formatarParaPrompt(guildId)

  const pontuadas = base.map(m => {
    let score = 0
    const chaveLower = m.chave.toLowerCase()
    const valorLower = (m.valor || "").toLowerCase()
    const catLower = (m.categoria || "").toLowerCase()
    for (const termo of termos) {
      if (chaveLower.includes(termo)) score += 5
      if (valorLower.includes(termo)) score += 3
      if (catLower.includes(termo)) score += 1
    }
    score += (m.prioridade || 3) * 0.5
    score += Math.min((m.acessos || 0) * 0.2, 2)
    if (m.guildId) score += 0.5
    return { ...m, score }
  })

  const relevantes = pontuadas
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItens)

  if (!relevantes.length) {
    return formatarParaPrompt(guildId)
  }

  const linhas = relevantes.map(m =>
    `[${m.categoria || "outro"}] ${m.chave}: ${(m.valor || "").slice(0, 200)}`
  )
  return "Memorias relevantes:\n" + linhas.join("\n")
}

module.exports = { lembrar, esquecer, buscar, buscarPorCategoria, listar, limparExpiradas, estatisticas, formatarParaPrompt, buscarRelevantes }