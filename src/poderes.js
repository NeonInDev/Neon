// Sistema de poderes/dobras do servidor de RP
// Le as fichas aprovadas no forum "criacao" (tag Aprovado), guarda em data/poderes.json
// e serve de exemplo/referencia para a Neon avaliar fichas novas.
const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

const ARQUIVO = path.join(__dirname, "..", "data", "poderes.json");

const GUILD_ID = "1536726615470645330";
const FORUM_ID = "1536726631291424929"; // canal criacao (forum)
const TAG_APROVADO = "1542013039736266842"; // tag "Aprovado"
const TAG_EM_ANALISE = "1542013176147611658"; // tag "Em-Analise"

const PADRAO = {
  config: { guildId: GUILD_ID, forumId: FORUM_ID },
  regrasAprendidas: [],
  poderes: [],
  atualizadoEm: null,
};

let cache = null;

function carregar() {
  if (cache) return cache;
  try {
    if (!fs.existsSync(ARQUIVO)) {
      cache = JSON.parse(JSON.stringify(PADRAO));
      return cache;
    }
    cache = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
    cache = {
      ...JSON.parse(JSON.stringify(PADRAO)),
      ...cache,
      config: { ...PADRAO.config, ...(cache.config || {}) },
      poderes: Array.isArray(cache.poderes) ? cache.poderes : [],
      regrasAprendidas: Array.isArray(cache.regrasAprendidas) ? cache.regrasAprendidas : [],
    };
  } catch (err) {
    log("ERROR", "[PODERES] Falha ao carregar", { erro: err.message });
    cache = JSON.parse(JSON.stringify(PADRAO));
  }
  return cache;
}

function persistir() {
  if (!fs.existsSync(path.dirname(ARQUIVO))) fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
  fs.writeFileSync(ARQUIVO, JSON.stringify(cache, null, 2), "utf8");
}

function linkThread(threadId, postId) {
  return `https://discord.com/channels/${GUILD_ID}/${threadId}/${postId || ""}`;
}

// junta o conteudo de uma thread (post inicial + respostas nao-bot)
async function coletarThread(thread) {
  const msgs = [];
  let antes;
  for (;;) {
    const lote = await thread.messages.fetch({ limit: 100, before: antes, cache: false }).catch(() => null);
    if (!lote || lote.size === 0) break;
    for (const m of lote.values()) {
      if (!m.author?.bot) msgs.push({ autor: m.author?.username || "?", conteudo: m.content || "" });
    }
    antes = lote.last()?.id;
    if (msgs.length >= 500) break;
  }
  msgs.reverse();
  const primeiro = msgs[0]?.conteudo || "";
  const corpo = msgs.slice(1).map((m) => m.conteudo).filter(Boolean).join("\n");
  return { primeiro, corpo, mensagens: msgs };
}

// carrega todas as threads (ativas + arquivadas) de um forum
async function carregarThreadsForum(forum) {
  const threads = new Map();
  for (const th of forum.threads.cache.values()) threads.set(th.id, th);
  try {
    const arq = await forum.threads.fetchArchived({ limit: 100, cache: false });
    for (const th of arq.threads.values()) threads.set(th.id, th);
  } catch { /* sem arquivadas ou sem acesso */ }
  return Array.from(threads.values());
}

// reler o forum e atualizar o banco de poderes aprovados
async function atualizar(client) {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return { ok: false, erro: "Servidor Ecos do Passado não encontrado." };
  const forum = guild.channels.cache.get(FORUM_ID);
  if (!forum || forum.type !== 15) return { ok: false, erro: "Canal de criação (fórum) não encontrado." };

  const threads = await carregarThreadsForum(forum);
  const poderes = [];
  const regrasAprendidas = [];

  for (const th of threads) {
    const tags = th.appliedTags || [];
    const aprovado = tags.includes(TAG_APROVADO);
    const emAnalise = tags.includes(TAG_EM_ANALISE);

    let postId = null;
    try {
      const start = await th.fetchStartMessage().catch(() => null);
      postId = start?.id || null;
    } catch { /* ignora */ }

    const { primeiro, corpo, mensagens } = await coletarThread(th);

    const dados = {
      nome: th.name,
      dono: th.ownerId || null,
      threadId: th.id,
      link: linkThread(th.id, postId),
      tagAprovado: aprovado,
      tagEmAnalise: emAnalise,
      tags: tags,
      postInicial: primeiro,
      corpo: corpo,
      mensagens: mensagens.length,
      atualizadoEm: new Date().toISOString(),
    };
    poderes.push(dados);

    // coleta conversas de avaliacao para aprendizado
    if (aprovado || emAnalise) {
      regrasAprendidas.push({
        nome: th.name,
        aprovado,
        link: dados.link,
        trecho: (primeiro || corpo).slice(0, 1500),
      });
    }
  }

  // regrasAprendidas so guarda os que realmente sao aprovados (exemplo de balanceamento)
  const aprovados = poderes.filter((p) => p.tagAprovado);

  const d = carregar();
  d.poderes = poderes;
  d.regrasAprendidas = aprovados.map((p) => ({
    nome: p.nome,
    link: p.link,
    trecho: (p.postInicial || p.corpo).slice(0, 1500),
  }));
  d.atualizadoEm = new Date().toISOString();
  persistir();

  log("INFO", "[PODERES] Banco atualizado", {
    guild: guild.name,
    threads: poderes.length,
    aprovados: aprovados.length,
  });
  return {
    ok: true,
    guild: guild.name,
    threads: poderes.length,
    aprovados: aprovados.length,
    regras: d.regrasAprendidas.length,
  };
}

function listarAprovados() {
  return carregar().poderes.filter((p) => p.tagAprovado);
}

function listar() {
  return carregar().poderes;
}

function buscar(termo) {
  const t = String(termo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const aprovados = listarAprovados();
  if (!t) return aprovados;
  return aprovados.filter((p) =>
    (p.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(t) ||
    (p.postInicial || "").toLowerCase().includes(t) ||
    (p.corpo || "").toLowerCase().includes(t)
  );
}

// texto pronto para injetar no prompt da IA: exemplos de fichas aprovadas
function exemplos(limite = 6) {
  const aprovados = listarAprovados().slice(0, limite);
  if (!aprovados.length) return "";
  const blocos = aprovados.map((p, i) => {
    const conteudo = (p.postInicial || p.corpo || "").slice(0, 900);
    return `[EXEMPLO ${i + 1}] ${p.nome} (por ${p.dono || "?"})\n${conteudo}\nLink: ${p.link}`;
  });
  return blocos.join("\n\n");
}

function resumo() {
  const d = carregar();
  return {
    atualizadoEm: d.atualizadoEm,
    total: d.poderes.length,
    aprovados: d.poderes.filter((p) => p.tagAprovado).length,
    emAnalise: d.poderes.filter((p) => p.tagEmAnalise).length,
    regras: d.regrasAprendidas.length,
  };
}

module.exports = { carregar, persistir, atualizar, listar, listarAprovados, buscar, exemplos, resumo };
