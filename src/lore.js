// Sistema de lore do servidor de RP/RPG - leitura de canais, indexacao e busca
const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

const ARQUIVO = path.join(__dirname, "..", "data", "lore.json");

const PADRAO = {
  config: {
    guildName: "Ecos do Passado",
    categorias: ["Informações", "Sistemas", "Informações e Sistemas"],
    canaisIgnorados: [],
  },
  banco: {},
  atualizadoEm: null,
  guildId: null,
  erros: [],
};

let cache = null;

function carregar() {
  if (cache) return cache;
  try {
    if (!fs.existsSync(ARQUIVO)) {
      cache = JSON.parse(JSON.stringify(PADRAO));
      return cache;
    }
    const lido = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
    cache = {
      ...JSON.parse(JSON.stringify(PADRAO)),
      ...lido,
      config: { ...PADRAO.config, ...(lido.config || {}) },
      banco: lido.banco || {},
    };
  } catch (err) {
    log("ERROR", "[LORE] Falha ao carregar", { erro: err.message });
    cache = JSON.parse(JSON.stringify(PADRAO));
  }
  return cache;
}

function persistir() {
  if (!fs.existsSync(path.dirname(ARQUIVO))) fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
  fs.writeFileSync(ARQUIVO, JSON.stringify(cache, null, 2), "utf8");
}

function normalizar(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function acharGuild(client) {
  const d = carregar();
  let guild = client.guilds.cache.find((g) => normalizar(g.name) === normalizar(d.config.guildName));
  if (!guild) {
    guild = client.guilds.cache.find((g) => normalizar(g.name).includes(normalizar(d.config.guildName)));
  }
  return guild || null;
}

function acharCategorias(guild) {
  const d = carregar();
  const nomes = d.config.categorias.map(normalizar);
  const cats = guild.channels.cache.filter((c) => c.type === 4 && nomes.includes(normalizar(c.name)));
  return Array.from(cats.values());
}

function acharCanaisTexto(guild) {
  const d = carregar();
  const ignorados = d.config.canaisIgnorados.map(normalizar);
  const cats = acharCategorias(guild);
  const catIds = new Set(cats.map((c) => c.id));
  const canais = guild.channels.cache.filter(
    (c) =>
      c.type === 0 && // texto
      catIds.has(c.parentId) &&
      !ignorados.includes(normalizar(c.name)) &&
      c.viewable
  );
  return Array.from(canais.values());
}

// baixa todas as mensagens de um canal
async function lerCanal(canal, limite = 2000) {
  const msgs = [];
  let antes;
  for (;;) {
    const lote = await canal.messages.fetch({ limit: 100, before: antes, cache: false }).catch(() => null);
    if (!lote || lote.size === 0) break;
    for (const m of lote.values()) {
      if (!m.author?.bot) {
        msgs.push({ autor: m.author?.username || "?", conteudo: m.content || "[sem texto]" });
      }
    }
    antes = lote.last()?.id;
    if (msgs.length >= limite) break;
  }
  return msgs.reverse();
}

// reler os canais configurados e atualizar o banco
async function atualizar(client) {
  const guild = acharGuild(client);
  if (!guild) {
    return { ok: false, erro: `Servidor "${carregar().config.guildName}" não encontrado. Confere se a Neon está nele.` };
  }
  const cats = acharCategorias(guild);
  if (!cats.length) {
    return {
      ok: false,
      erro: `Nenhuma categoria encontrada (${carregar().config.categorias.join(", ")}). Confere os nomes.`,
    };
  }

  const banco = {};
  const catIds = new Set(cats.map((c) => c.id));
  const canais = Array.from(
    guild.channels.cache.filter(
      (c) => c.type === 0 && catIds.has(c.parentId) && c.viewable
    ).values()
  );

  let total = 0;
  for (const canal of canais) {
    const cat = guild.channels.cache.get(canal.parentId);
    const catNome = cat?.name || "sem-categoria";
    if (!banco[catNome]) banco[catNome] = {};
    const msgs = await lerCanal(canal);
    banco[catNome][canal.name] = msgs;
    total += msgs.length;
  }

  const d = carregar();
  d.banco = banco;
  d.guildId = guild.id;
  d.atualizadoEm = new Date().toISOString();
  d.erros = [];
  persistir();

  log("INFO", "[LORE] Banco atualizado", { guild: guild.name, categorias: Object.keys(banco).length, mensagens: total });
  return { ok: true, guild: guild.name, mensagens: total, categorias: Object.keys(banco), canais: canais.length };
}

// busca textual no banco indexado
function buscar(termo, limite = 2000) {
  const d = carregar();
  const t = normalizar(termo);
  const termos = t.split(/\s+/).filter(Boolean);
  if (!termos.length) return { ok: false, erro: "Termo vazio." };

  const resultados = [];
  for (const [cat, canais] of Object.entries(d.banco)) {
    for (const [canal, msgs] of Object.entries(canais)) {
      for (const m of msgs) {
        const conteudo = m.conteudo || "";
        const cN = normalizar(conteudo);
        // todos os termos devem aparecer (AND)
        const casou = termos.every((tt) => cN.includes(tt));
        if (!casou) continue;
        // trecho ao redor do primeiro termo
        const idx = cN.indexOf(termos[0]);
        const a = Math.max(0, conteudo.length ? idx - 100 : 0);
        const z = conteudo.length ? idx + 300 : conteudo.length;
        resultados.push({
          categoria: cat,
          canal,
          autor: m.autor,
          trecho: (conteudo.slice(a, z) || conteudo).slice(0, limite),
          conteudo: conteudo.slice(0, limite),
        });
      }
    }
  }
  // dedup por conteudo
  const vistos = new Set();
  const unicos = [];
  for (const r of resultados) {
    const chave = r.conteudo;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push(r);
    if (unicos.length >= 10) break;
  }
  return { ok: true, total: unicos.length, resultados: unicos };
}

// lista de canais/categorias disponiveis (pra autocomplete/referencia)
function resumo() {
  const d = carregar();
  const categorias = Object.keys(d.banco);
  const canais = [];
  for (const cat of categorias) {
    for (const c of Object.keys(d.banco[cat])) canais.push(`${cat}/${c}`);
  }
  return { categorias, canais, atualizadoEm: d.atualizadoEm, guildId: d.guildId, config: d.config };
}

module.exports = { carregar, persistir, atualizar, buscar, resumo, acharGuild, normalizar };
