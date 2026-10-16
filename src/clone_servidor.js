"use strict";

// Clonagem de servidor Discord (estrutura + conteudo) rodando DENTRO do Neon.
// Usa o client ja conectado (nao abre segundo gateway). Job assincrono,
// resumivel via data/clone_state.json.
//
// Regra de conteudo (definida pelo dono):
//   - Copia mensagens de TODOS os canais, EXCETO os que estao dentro das 9
//     categorias excluidas (nelas so a estrutura, sem conteudo).
//   - Lista extra de canais/categorias que SEMPRE tem conteudo (ex.: aulas e
//     notificacoes, que ficam dentro do U.A, categoria excluida).

const fs = require("fs");
const path = require("path");
const { ChannelType, AttachmentBuilder, OverwriteType } = require("discord.js");
const { client } = require("./client");
const { log } = require("./logger");

const STATE_PATH = path.join(__dirname, "..", "data", "clone_state.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Categorias cujo CONTEUDO nao deve ser copiado (so nome/estrutura).
const CATS_SEM_CONTEUDO = new Set([
  "1498169515496702063", // criacao
  "1498404849165799575", // O Abismo
  "1498405852493910117", // Residencias
  "1498406786808549436", // Musutafu City
  "1498410502894649497", // U.A
  "1498430441802170649", // Hosu Blessed City
  "1498522790985203874", // Esuha Cursed City
  "1498525625626001438", // Naruhata City
  "1498533229764804739", // Festival Escolar
]);

// Canais/categorias que SEMPRE tem conteudo (override), inclusive dentro de
// categorias excluidas.
const CONTEUDO_EXTRA = new Set([
  "1498207958147010690", // tabelas-rework
  "1498208326255906998", // denuncias
  "1498413847982117016", // categoria Inferno?
  "1558986516041179166", // categoria China
  "1498428450183319602", // aulas (dentro do U.A)
  "1554658867445760091", // notificacoes (dentro do U.A)
  "1558986712384807032", // sala-de-conferencias (categoria China)
]);

const TIPO = {
  [ChannelType.GuildText]: "texto",
  [ChannelType.GuildVoice]: "voz",
  [ChannelType.GuildCategory]: "categoria",
  [ChannelType.GuildAnnouncement]: "anuncio",
  [ChannelType.GuildStageVoice]: "stage",
  [ChannelType.GuildForum]: "forum",
  [ChannelType.GuildMedia]: "midia",
};

let job = null; // { status, parar, inicio, ... }

function jaRodando() {
  return job && job.status === "rodando";
}

function carregarEstado() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function salvarEstado(e) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    e.atualizadoEm = new Date().toISOString();
    fs.writeFileSync(STATE_PATH, JSON.stringify(e, null, 2), "utf8");
  } catch (err) {
    log("WARN", "[CLONE] falha ao salvar estado", { erro: err.message });
  }
}

function estadoNovo(origem, destino, opcoes) {
  return {
    origem,
    destino,
    opcoes,
    iniciadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
    status: "iniciando",
    categorias: {},
    canais: {},
    threads: {},
    msgProgresso: {},
    conteudoCanalConcluido: {},
    forumConcluido: {},
    contagem: {
      cargos: 0,
      categorias: 0,
      canais: 0,
      overwrites: 0,
      mensagens: 0,
      threads: 0,
      posts: 0,
      erros: 0,
      pulados: 0,
    },
    ultimoErro: null,
  };
}

function normalizarTag(tag) {
  if (!tag) return null;
  const out = { name: String(tag.name).slice(0, 20), moderated: !!tag.moderated };
  const emoji = tag.emoji;
  if (emoji) {
    if (emoji.id) out.emoji = { id: emoji.id, name: emoji.name || undefined };
    else if (emoji.name) out.emoji = { name: emoji.name };
  }
  return out;
}

function nomeAutor(m) {
  try {
    return m.member?.displayName || m.author?.displayName || m.author?.username || "desconhecido";
  } catch {
    return "desconhecido";
  }
}

function avatarAutor(m) {
  try {
    return m.author.displayAvatarURL({ size: 128 });
  } catch {
    return undefined;
  }
}

// Monta o payload de uma mensagem (conteudo + embeds + anexos reenviados).
async function montarPayload(m, { prefixoAutor = false } = {}) {
  const content = String(m.content || "").slice(0, 2000);
  const embeds = [];
  for (const e of m.embeds || []) {
    try { embeds.push(e.toJSON()); } catch {}
    if (embeds.length >= 10) break;
  }
  const files = [];
  for (const a of m.attachments?.values?.() || []) {
    if (a.size && a.size > 24 * 1024 * 1024) continue;
    try {
      const resp = await fetch(a.url);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const buf = Buffer.from(await resp.arrayBuffer());
      files.push(new AttachmentBuilder(buf, { name: a.name || "arquivo" }));
    } catch (err) {
      // anexo individual que falhou nao impede o resto
    }
    if (files.length >= 10) break;
  }

  const partes = [];
  if (prefixoAutor) {
    const quando = `<t:${Math.floor(m.createdTimestamp / 1000)}:f>`;
    partes.push(`**${nomeAutor(m)}** · ${quando}`);
  }
  if (content) partes.push(content);

  const payload = { allowedMentions: { parse: [] } };
  const final = partes.join("\n").slice(0, 2000);
  if (final) payload.content = final;
  if (embeds.length) payload.embeds = embeds;
  if (files.length) payload.files = files;
  return payload;
}

function vazio(payload) {
  const temContent = payload.content && payload.content.trim();
  const temEmbeds = payload.embeds && payload.embeds.length;
  const temFiles = payload.files && payload.files.length;
  return !temContent && !temEmbeds && !temFiles;
}

// Envia usando webhook (imita autor). Se webhook indisponivel, usa channel.send.
async function enviar(destino, webhook, m, threadId, estado) {
  const payload = await montarPayload(m);
  if (vazio(payload)) return false;

  if (webhook) {
    payload.username = nomeAutor(m).slice(0, 80);
    const av = avatarAutor(m);
    if (av) payload.avatarURL = av;
    if (threadId) payload.threadId = threadId;
    try {
      await webhook.send(payload);
      return true;
    } catch (err1) {
      // 2a tentativa: so texto (descarta embeds/anexos possivelmente invalidos)
      try {
        const t = (payload.content || "(anexo/embed nao copiado)").slice(0, 2000);
        const p2 = { content: t, username: payload.username, allowedMentions: { parse: [] } };
        if (av) p2.avatarURL = av;
        if (threadId) p2.threadId = threadId;
        await webhook.send(p2);
        return true;
      } catch (err2) {
        if (estado) estado.contagem.erros++;
        log("WARN", "[CLONE] msg falhou", { id: m.id, erro: err2.message.slice(0, 120) });
        return false;
      }
    }
  }

  // sem webhook: manda como bot (perde a autoria)
  try {
    const out = { content: payload.content, embeds: payload.embeds, files: payload.files, allowedMentions: { parse: [] } };
    await destino.send(out);
    return true;
  } catch (err) {
    if (estado) estado.contagem.erros++;
    return false;
  }
}

async function obterWebhook(canal, estado) {
  try {
    log("INFO", "[CLONE] obterWebhook", { canal: canal.name, cache: !!(estado.webhooks && estado.webhooks[canal.id]) });
    if (estado.webhooks && estado.webhooks[canal.id]) {
      const w = await client.fetchWebhook(estado.webhooks[canal.id]).catch(() => null);
      if (w) return w;
    }
    log("INFO", "[CLONE] criando webhook", { canal: canal.name });
    const w = await canal.createWebhook({ name: "Clone Neon" });
    estado.webhooks = estado.webhooks || {};
    estado.webhooks[canal.id] = w.id;
    return w;
  } catch (err) {
    log("WARN", "[CLONE] webhook indisponivel (sem permissao?)", { canal: canal.name, erro: err.message.slice(0, 120) });
    return null;
  }
}

async function coletarMensagens(canal, limite, estado) {
  const out = [];
  let before;
  log("INFO", "[CLONE] coletar inicio", { canal: canal.name });
  for (;;) {
    if (job && job.parar) break;
    const lote = await canal.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!lote || lote.size === 0) break;
    for (const m of lote.values()) out.push(m);
    before = lote.last().id;
    if (out.length % 1000 === 0 || lote.size < 100) log("INFO", "[CLONE] coletar progresso", { canal: canal.name, total: out.length });
    if (lote.size < 100) break;
    if (out.length >= limite) break;
    await sleep(250);
  }
  out.reverse(); // mais antigas primeiro
  return out;
}

async function copiarMensagens(srcCanal, destCanal, webhook, estado, { ignorarId = null, threadId = null } = {}) {
  const limite = estado.opcoes?.limitePorCanal || Infinity;
  const todas = await coletarMensagens(srcCanal, limite, estado);
  const ultima = estado.msgProgresso[srcCanal.id];
  let ultimaTmp = ultima;
  let enviadas = 0;
  for (const m of todas) {
    if (job && job.parar) break;
    if (ignorarId && m.id === ignorarId) continue;
    if (ultimaTmp && BigInt(m.id) <= BigInt(ultimaTmp)) continue;
    const ok = await enviar(destCanal, webhook, m, threadId, estado);
    if (ok) {
      enviadas++;
      estado.contagem.mensagens++;
    } else {
      estado.contagem.pulados++;
    }
    ultimaTmp = m.id;
    if (enviadas % 200 === 0) salvarEstado(estado);
    await sleep(120);
  }
  if (!threadId) estado.msgProgresso[srcCanal.id] = ultimaTmp || ultima;
  return enviadas;
}

async function listarThreads(canal) {
  const threads = [];
  log("INFO", "[CLONE] listarThreads inicio", { canal: canal.name });
  try {
    const ativos = await canal.threads.fetchActive();
    for (const t of ativos.threads.values()) threads.push(t);
    log("INFO", "[CLONE] threads ativos", { canal: canal.name, n: ativos.threads.size });
  } catch {}
  for (const tipo of ["public", "private"]) {
    let before;
    let guarda = 0;
    for (;;) {
      if (guarda++ > 200) break;
      let arq;
      try {
        arq = await canal.threads.fetchArchived({ limit: 100, type: tipo, ...(before ? { before } : {}) });
      } catch {
        break;
      }
      if (!arq || !arq.threads.size) break;
      for (const t of arq.threads.values()) threads.push(t);
      log("INFO", "[CLONE] threads arquivados", { canal: canal.name, tipo, n: arq.threads.size, total: threads.length, more: arq.hasMore });
      if (!arq.hasMore) break;
      before = arq.threads.last().archivedAt;
    }
  }
  threads.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return threads;
}

async function copiarThreadsTexto(srcCanal, destCanal, webhook, estado) {
  const threads = await listarThreads(srcCanal);
  for (const t of threads) {
    if (job && job.parar) break;
    if (estado.threads[t.id]) continue;
    try {
      const novo = await destCanal.threads.create({
        name: t.name,
        type: t.type,
        autoArchiveDuration: t.autoArchiveDuration || 1440,
        rateLimitPerUser: t.rateLimitPerUser || 0,
        reason: "Clone Neon",
      });
      estado.threads[t.id] = novo.id;
      estado.contagem.threads++;
      salvarEstado(estado);
      await copiarMensagens(t, destCanal, webhook, estado, { threadId: novo.id });
    } catch (err) {
      estado.contagem.erros++;
      log("WARN", "[CLONE] thread falhou", { thread: t.name, erro: err.message.slice(0, 120) });
    }
  }
}

async function copiarForum(srcForum, destForum, estado) {
  if (estado.forumConcluido[srcForum.id]) return;
  const webhook = await obterWebhook(destForum, estado);
  const tags = await listarThreads(srcForum);
  const tagMap = {};
  for (const t of srcForum.availableTags || []) tagMap[t.id] = t.name;
  const destTags = {};
  for (const t of destForum.availableTags || []) destTags[t.name] = t.id;

  for (const t of tags) {
    if (job && job.parar) break;
    if (estado.threads[t.id]) continue;
    let starter = null;
    try {
      starter = await t.fetchStarterMessage();
    } catch {}
    const applied = (t.appliedTags || []).map((id) => destTags[tagMap[id]]).filter(Boolean);
    const opts = {
      name: t.name,
      autoArchiveDuration: t.autoArchiveDuration || 1440,
      reason: "Clone Neon",
      message: {},
    };
    if (applied.length) opts.appliedTags = applied.slice(0, 5);
    if (starter) {
      const p = await montarPayload(starter, { prefixoAutor: true });
      opts.message = {
        content: p.content,
        embeds: p.embeds,
        files: p.files,
        allowedMentions: { parse: [] },
      };
    } else {
      opts.message = { content: t.name };
    }
    try {
      const novo = await destForum.threads.create(opts);
      estado.threads[t.id] = novo.id;
      estado.contagem.posts++;
      salvarEstado(estado);
      await copiarMensagens(t, destForum, webhook, estado, { ignorarId: starter?.id || null, threadId: novo.id });
    } catch (err) {
      estado.contagem.erros++;
      log("WARN", "[CLONE] post de forum falhou", { post: t.name, erro: err.message.slice(0, 120) });
    }
  }
  estado.forumConcluido[srcForum.id] = true;
  salvarEstado(estado);
}

function deveCopiarConteudo(srcCanal) {
  if (CONTEUDO_EXTRA.has(srcCanal.id)) return true;
  if (srcCanal.parentId && CATS_SEM_CONTEUDO.has(srcCanal.parentId)) return false;
  return true;
}

function deveCopiarConteudoDoPai(srcCanal) {
  return deveCopiarConteudo(srcCanal);
}

function propriedadesCanal(src) {
  const base = { name: src.name, type: src.type, reason: "Clone Neon" };
  if (src.parentId) base.parent = src.parentId;
  if (src.isTextBased?.() && !src.isVoiceBased?.()) {
    if (typeof src.topic === "string" && src.topic) base.topic = src.topic.slice(0, 1024);
    if (typeof src.nsfw === "boolean") base.nsfw = src.nsfw;
    if (typeof src.rateLimitPerUser === "number") base.rateLimitPerUser = src.rateLimitPerUser;
  }
  if (src.type === ChannelType.GuildVoice) {
    if (typeof src.bitrate === "number") base.bitrate = Math.min(src.bitrate, 96000);
    if (typeof src.userLimit === "number") base.userLimit = src.userLimit;
  }
  if (src.type === ChannelType.GuildForum || src.type === ChannelType.GuildMedia) {
    if (typeof src.topic === "string" && src.topic) base.topic = src.topic.slice(0, 1024);
    if (typeof src.nsfw === "boolean") base.nsfw = src.nsfw;
    if (typeof src.rateLimitPerUser === "number") base.rateLimitPerUser = src.rateLimitPerUser;
    if (typeof src.defaultThreadRateLimitPerUser === "number") base.defaultThreadRateLimitPerUser = src.defaultThreadRateLimitPerUser;
    if (typeof src.defaultAutoArchiveDuration === "number") base.defaultAutoArchiveDuration = src.defaultAutoArchiveDuration;
    const tags = (src.availableTags || []).map(normalizarTag).filter(Boolean);
    if (tags.length) base.availableTags = tags.slice(0, 20);
  }
  return base;
}

// Copia os cargos. Nao recria cargos gerenciados (bots/integracoes).
async function criarCargos(srcGuild, dstGuild, estado) {
  await srcGuild.roles.fetch();
  await dstGuild.roles.fetch();
  estado.roles = estado.roles || {};

  // @everyone: edita as permissoes em vez de "criar"
  const srcEveryone = srcGuild.roles.everyone;
  if (srcEveryone && estado.roles[srcEveryone.id] == null) {
    try {
      await dstGuild.roles.everyone.setPermissions(srcEveryone.permissions.bitfield, { reason: "Clone Neon" });
      estado.roles[srcEveryone.id] = dstGuild.id;
      salvarEstado(estado);
    } catch (err) {
      log("WARN", "[CLONE] @everyone falhou", { erro: err.message.slice(0, 150) });
    }
  }
  estado.roles[srcEveryone.id] = dstGuild.id;

  const srcRoles = [...srcGuild.roles.cache.values()]
    .filter((r) => r.id !== srcGuild.id)
    .sort((a, b) => a.position - b.position);

  const desejadas = [];
  for (const r of srcRoles) {
    if (job && job.parar) break;
    if (estado.roles[r.id]) { desejadas.push([r, estado.roles[r.id]]); continue; }
    if (r.managed) continue; // cargos de integracao/bot: nao podem ser recriados
    let novo = null;
    try {
      novo = await dstGuild.roles.create({
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        mentionable: r.mentionable,
        permissions: r.permissions.bitfield,
        reason: "Clone Neon",
      });
    } catch (err) {
      // provavelmente faltou permissao p/ conceder algo: recria sem permissoes
      try {
        novo = await dstGuild.roles.create({
          name: r.name,
          color: r.color,
          hoist: r.hoist,
          mentionable: r.mentionable,
          reason: "Clone Neon",
        });
      } catch (err2) {
        estado.contagem.erros++;
        log("WARN", "[CLONE] cargo falhou", { nome: r.name, erro: err2.message.slice(0, 150) });
      }
    }
    if (novo) {
      estado.roles[r.id] = novo.id;
      estado.contagem.cargos++;
      desejadas.push([r, novo.id]);
      salvarEstado(estado);
      await sleep(300);
    }
  }

  // posicoes: uma unica chamada em lote (o endpoint por-cargo e' fortemente
  // limitado por rate limit e travava a clonagem)
  const posicoes = desejadas
    .map(([r, dstId]) => ({ role: dstId, position: r.position }))
    .filter((p) => p.position > 0);
  if (posicoes.length) {
    try {
      await dstGuild.roles.setPositions(posicoes);
      log("INFO", "[CLONE] cargos reposicionados (lote)", { total: posicoes.length });
    } catch (err) {
      estado.contagem.erros++;
      log("WARN", "[CLONE] setPositions falhou", { erro: err.message.slice(0, 150) });
    }
  }
  salvarEstado(estado);
  log("INFO", "[CLONE] cargos criados", { cargos: estado.contagem.cargos, mapeados: Object.keys(estado.roles).length });
}

function mapOverwrites(srcCanal, srcGuild, estado) {
  const out = [];
  for (const ow of srcCanal.permissionOverwrites?.cache?.values?.() || []) {
    let id = ow.id;
    if (ow.type === OverwriteType.Role) {
      if (ow.id === srcGuild.id) id = estado.roles?.[srcGuild.id] || srcGuild.id;
      else id = estado.roles?.[ow.id];
    }
    if (!id) continue;
    out.push({ id, type: ow.type, allow: ow.allow.bitfield, deny: ow.deny.bitfield });
  }
  return out;
}

async function aplicarOverwrites(srcGuild, dstGuild, estado) {
  estado.overwritesFeitos = estado.overwritesFeitos || {};
  const srcCanais = [...srcGuild.channels.cache.filter((c) => !c.isThread()).values()];
  for (const src of srcCanais) {
    if (job && job.parar) break;
    if (estado.overwritesFeitos[src.id]) continue;
    const dstId = src.type === ChannelType.GuildCategory ? estado.categorias[src.id] : estado.canais[src.id];
    if (!dstId) continue;
    const lista = mapOverwrites(src, srcGuild, estado);
    if (!lista.length) { estado.overwritesFeitos[src.id] = true; continue; }
    try {
      const dst = await dstGuild.channels.fetch(dstId).catch(() => null);
      if (!dst) continue;
      await dst.permissionOverwrites.set(lista);
      estado.contagem.overwrites++;
      estado.overwritesFeitos[src.id] = true;
      salvarEstado(estado);
      await sleep(150);
    } catch (err) {
      estado.contagem.erros++;
      log("WARN", "[CLONE] overwrites falharam", { canal: src.name, erro: err.message.slice(0, 150) });
      estado.overwritesFeitos[src.id] = true; // nao repetir
    }
  }
  salvarEstado(estado);
  log("INFO", "[CLONE] overwrites aplicados", { total: estado.contagem.overwrites });
}

function nomeNormalizado(nome) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Se o destino ja tem um canal de MESMO NOME com conteudo, pula o canal de
// origem por completo (nao cria duplicata, nao posta nada).
async function marcarDuplicados(srcGuild, dstGuild, estado) {
  estado.duplicados = estado.duplicados || {};
  const nossos = new Set([
    ...Object.values(estado.canais || {}),
    ...Object.values(estado.categorias || {}),
  ]);
  const comConteudo = new Set();
  for (const ch of dstGuild.channels.cache.values()) {
    if (nossos.has(ch.id)) continue;
    if (!ch.isTextBased() || ch.isThread()) continue;
    const col = await ch.messages.fetch({ limit: 1 }).catch(() => null);
    if (col && col.size > 0) comConteudo.add(nomeNormalizado(ch.name));
  }
  if (!comConteudo.size) return;
  for (const src of srcGuild.channels.cache.filter((c) => !c.isThread()).values()) {
    if (src.type === ChannelType.GuildCategory) continue;
    if (!comConteudo.has(nomeNormalizado(src.name))) continue;
    estado.duplicados[src.id] = true;
    // se ja criamos uma duplicata numa rodada anterior, apaga
    const dstId = estado.canais[src.id];
    if (dstId) {
      const dst = await dstGuild.channels.fetch(dstId).catch(() => null);
      if (dst) await dst.delete("Clone Neon: canal ja existia com conteudo").catch(() => {});
      delete estado.canais[src.id];
      delete estado.conteudoCanalConcluido[src.id];
    }
    log("INFO", "[CLONE] pulando canal (ja existe com conteudo no destino)", { canal: src.name });
  }
  salvarEstado(estado);
}

async function executar(origemId, destinoId, opcoes) {
  const srcGuild = await client.guilds.fetch(origemId);
  const dstGuild = await client.guilds.fetch(destinoId);
  if (!srcGuild) throw new Error("servidor de origem nao encontrado");
  if (!dstGuild) throw new Error("servidor de destino nao encontrado");

  try { await dstGuild.members.fetchMe(); } catch {}
  const perms = dstGuild.members.me?.permissions;
  log("INFO", "[CLONE] permissoes no destino", {
    destino: dstGuild.name,
    administrador: perms ? perms.has("Administrator") : "?",
    gerenciarCanais: perms ? perms.has("ManageChannels") : "?",
    gerenciarCargos: perms ? perms.has("ManageRoles") : "?",
    gerenciarWebhooks: perms ? perms.has("ManageWebhooks") : "?",
    gerenciarThreads: perms ? perms.has("ManageThreads") : "?",
  });

  let estado = carregarEstado();
  if (!estado || estado.origem !== origemId || estado.destino !== destinoId || opcoes.reiniciar) {
    estado = estadoNovo(origemId, destinoId, opcoes);
  }
  estado.opcoes = { ...(estado.opcoes || {}), ...opcoes };
  estado.contagem = Object.assign(
    { cargos: 0, categorias: 0, canais: 0, overwrites: 0, mensagens: 0, threads: 0, posts: 0, erros: 0, pulados: 0 },
    estado.contagem || {}
  );
  estado.status = "rodando";
  salvarEstado(estado);
  job.estado = estado;

  await srcGuild.channels.fetch();
  await dstGuild.channels.fetch();

  // 0) cargos (antes dos canais, pois os overwrites referenciam os cargos)
  if (estado.opcoes.copiarCargos !== false) {
    await criarCargos(srcGuild, dstGuild, estado);
  }

  // 0.1) canais ja existentes no destino com conteudo -> pular
  await marcarDuplicados(srcGuild, dstGuild, estado);

  const srcCanais = [...srcGuild.channels.cache.filter((c) => !c.isThread()).values()]
    .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));

  // 1) cria categorias + canais
  for (const src of srcCanais) {
    if (job.parar) break;
    if (estado.duplicados[src.id]) continue;
    if (src.type === ChannelType.GuildCategory) {
      if (estado.categorias[src.id]) continue;
      try {
        const novo = await dstGuild.channels.create({ name: src.name, type: ChannelType.GuildCategory, reason: "Clone Neon" });
        estado.categorias[src.id] = novo.id;
        estado.contagem.categorias++;
        salvarEstado(estado);
      } catch (err) {
        estado.contagem.erros++;
        log("WARN", "[CLONE] categoria falhou", { nome: src.name, erro: err.message.slice(0, 120) });
      }
      continue;
    }

    if (estado.canais[src.id]) continue;
    const props = propriedadesCanal(src);
    if (src.parentId && estado.categorias[src.parentId]) props.parent = estado.categorias[src.parentId];
    else delete props.parent;
    try {
      const novo = await dstGuild.channels.create(props);
      estado.canais[src.id] = novo.id;
      estado.contagem.canais++;
      salvarEstado(estado);
    } catch (err) {
      estado.contagem.erros++;
      log("WARN", "[CLONE] canal falhou", { nome: src.name, tipo: TIPO[src.type] || src.type, erro: err.message.slice(0, 150) });
    }
  }

  if (job.parar) {
    estado.status = "parado";
    salvarEstado(estado);
    return;
  }

  // 1.5) permissas (overwrites) de cada categoria e canal
  if (estado.opcoes.copiarOverwrites !== false) {
    await aplicarOverwrites(srcGuild, dstGuild, estado);
  }

  // 2) conteudo
  if (estado.opcoes.copiarConteudo !== false) {
    for (const src of srcCanais) {
      if (job.parar) break;
      if (src.type === ChannelType.GuildCategory) continue;
      if (estado.duplicados[src.id]) continue;
      const dstId = estado.canais[src.id];
      if (!dstId) continue;
      const dest = await dstGuild.channels.fetch(dstId).catch(() => null);
      if (!dest) continue;

      const apenas = estado.opcoes.apenasConteudo;
      const listado = Array.isArray(apenas) && apenas.length && apenas.includes(src.id);
      if (Array.isArray(apenas) && apenas.length && !listado) continue;
      const querConteudo = listado ? true : deveCopiarConteudo(src);
      log("INFO", "[CLONE] avaliando canal", { nome: src.name, tipo: TIPO[src.type] || src.type, quer: querConteudo, texto: dest.isTextBased() });

      try {
        if (src.type === ChannelType.GuildForum || src.type === ChannelType.GuildMedia) {
          if (querConteudo && estado.opcoes.copiarThreads !== false) {
            if (!estado.forumConcluido[src.id]) await copiarForum(src, dest, estado);
          }
          continue;
        }

        if (!dest.isTextBased()) continue;

        if (!querConteudo) continue;
        if (estado.conteudoCanalConcluido[src.id] && !estado.opcoes.recopiar) continue;

        const webhook = await obterWebhook(dest, estado);
        if (estado.opcoes.copiarThreads !== false) {
          await copiarThreadsTexto(src, dest, webhook, estado);
        }
        await copiarMensagens(src, dest, webhook, estado);
        estado.conteudoCanalConcluido[src.id] = true;
        salvarEstado(estado);
        log("INFO", "[CLONE] canal concluido", { nome: src.name, mensagens: estado.contagem.mensagens });
      } catch (err) {
        estado.contagem.erros++;
        estado.ultimoErro = `${src.name}: ${err.message}`;
        log("WARN", "[CLONE] conteudo do canal falhou", { nome: src.name, erro: err.message.slice(0, 150) });
      }
    }
  }

  if (job.parar) {
    estado.status = "parado";
  } else {
    estado.status = "concluido";
    // limpa os webhooks usados (as mensagens mantem o autor)
    for (const wid of Object.values(estado.webhooks || {})) {
      try {
        const w = await client.fetchWebhook(wid).catch(() => null);
        if (w) await w.delete();
      } catch {}
    }
    estado.webhooks = {};
  }
  estado.fimEm = new Date().toISOString();
  salvarEstado(estado);
  log("INFO", "[CLONE] Fim", { status: estado.status, contagem: estado.contagem });
}

function iniciar({ origem, destino, reiniciar, copiarConteudo, copiarThreads, copiarCargos, copiarOverwrites, limitePorCanal, apenasConteudo } = {}) {
  if (!origem || !destino) return { ok: false, erro: "origem e destino sao obrigatorios" };
  if (jaRodando()) return { ok: false, erro: "ja existe um clone rodando", job: status() };
  job = { status: "rodando", parar: false, inicio: new Date().toISOString(), origem, destino, estado: null, erro: null };
  const opcoes = {
    reiniciar: !!reiniciar,
    copiarConteudo: copiarConteudo !== false,
    copiarThreads: copiarThreads !== false,
    copiarCargos: copiarCargos !== false,
    copiarOverwrites: copiarOverwrites !== false,
    limitePorCanal: limitePorCanal ? Number(limitePorCanal) : 0,
    apenasConteudo: Array.isArray(apenasConteudo) ? apenasConteudo.map(String) : [],
  };
  (async () => {
    try {
      await executar(String(origem), String(destino), opcoes);
      job.status = job.parar ? "parado" : "concluido";
    } catch (err) {
      job.status = "erro";
      job.erro = err.message;
      log("ERROR", "[CLONE] job falhou", { erro: err.message, stack: err.stack?.slice(0, 800) });
    }
  })();
  return { ok: true, iniciado: true, origem, destino, opcoes };
}

function parar() {
  if (!job || job.status !== "rodando") return { ok: true, ja: true };
  job.parar = true;
  return { ok: true, parando: true };
}

function status() {
  const estado = (job && job.estado) || carregarEstado();
  return {
    rodando: jaRodando(),
    job: job ? { status: job.status, inicio: job.inicio, erro: job.erro, origem: job.origem, destino: job.destino } : null,
    estado,
  };
}

module.exports = { iniciar, parar, status, CATS_SEM_CONTEUDO, CONTEUDO_EXTRA };
