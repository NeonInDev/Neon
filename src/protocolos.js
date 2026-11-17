// =============================================================
// PROTOCOLOS DO DONO
// -------------------------------------------------------------
// THANOS  — apaga todas as mensagens de um membro no servidor
// TONY    — backup das mensagens do servidor em JSON
// EMILIA  — tira e guarda todos os cargos de um membro (por um tempo
//           ou permanente) e devolve depois
//
// Tudo age com o cargo da NEON: quem chama é reconhecido por ID
// (perm.isDonoModeracao), nunca por cargo no Discord.
//
// Limites que são do Discord, não do código:
// - apagar em lote só vale para mensagens com menos de 14 dias; as mais
//   velhas saem uma por uma (por isso a varredura é lenta);
// - a Neon precisa de Gerenciar Mensagens (Thanatos/Tony precisa só ler)
//   e de Gerenciar Cargos + cargo acima do alvo (Emilia).
// =============================================================
const fs = require("fs");
const path = require("path");
const { PermissionFlagsBits, ChannelType } = require("discord.js");
const { log } = require("./logger");
const { varrer } = require("./varredura");
const { cargoPerigoso } = require("./mod-utils");

const DIR_BACKUPS =
  process.env.PROTOCOLO_BACKUPS_DIR || path.join(__dirname, "..", "backups", "protocolos");
const ARQ_EMILIA = process.env.PROTOCOLO_EMILIA_ARQ || path.join(__dirname, "..", "data", "protocolo_emilia.json");

// teto por execução do Thanos, pra não virar uma varredura de horas
const MAX_APAGAR_THANOS = 20000;
// teto do Tony por canal (evita arquivo gigante e rate limit)
const MAX_MSGS_TONY = 20000;
const PAUSA = 350;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function carimbo() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// Desconta do "resto" que ainda pode ser apagado nesta execução.
function tetoRestante(usado) {
  return Math.max(0, MAX_APAGAR_THANOS - usado);
}

// -------------------------------------------------------------
// canais que a Neon consegue ler (e, se pedir, apagar)
// -------------------------------------------------------------
const TIPOS_TEXTO = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);
const TIPOS_FORUM = new Set([ChannelType.GuildForum, ChannelType.GuildMedia]);

function nomeDoTipo(tipo) {
  return (
    {
      [ChannelType.GuildText]: "texto",
      [ChannelType.GuildAnnouncement]: "anuncio",
      [ChannelType.GuildForum]: "forum",
      [ChannelType.GuildMedia]: "midia",
    }[tipo] || String(tipo)
  );
}

function canaisDeTexto(
  guild,
  { precisaApagar = false, canalId = null, categoriaIds = null, incluirForuns = false } = {}
) {
  const eu = guild.members.me;
  const cats = Array.isArray(categoriaIds) ? new Set(categoriaIds.map(String)) : null;
  const lista = [];
  for (const canal of guild.channels.cache.values()) {
    if (!canal || canal.isDMBased?.() || canal.isThread?.()) continue;
    if (!TIPOS_TEXTO.has(canal.type)) continue;
    if (canalId && canal.id !== canalId) continue;
    if (cats && !cats.has(String(canal.parentId || ""))) continue;
    if (!incluirForuns && TIPOS_FORUM.has(canal.type)) continue;
    const perm = canal.permissionsFor(eu);
    if (!perm?.has(PermissionFlagsBits.ViewChannel)) continue;
    if (!perm.has(PermissionFlagsBits.ReadMessageHistory)) continue;
    if (precisaApagar && !perm.has(PermissionFlagsBits.ManageMessages)) continue;
    lista.push(canal);
  }
  // mais novos primeiro: é onde a conversa acontece
  return lista.sort((a, b) => (b.rawPosition ?? 0) - (a.rawPosition ?? 0));
}

// -------------------------------------------------------------
// THANOS
// -------------------------------------------------------------
async function thanos(guild, userId, { canalId = null, dias = 30, onProgress = null } = {}) {
  const canais = canaisDeTexto(guild, { precisaApagar: true, canalId });
  if (!canais.length) {
    return { ok: false, erro: "não achei canal onde eu possa ler e apagar mensagens." };
  }

  const desdeMs = dias > 0 ? Date.now() - dias * 86400000 : null;
  let apagadas = 0;
  let achadas = 0;
  let feitos = 0;
  let ultimoAviso = 0;
  const pulados = [];

  for (const canal of canais) {
    if (tetoRestante(apagadas) <= 0) {
      pulados.push(canal);
      continue;
    }
    try {
      const r = await varrer(canal, [userId], tetoRestante(apagadas), { desdeMs });
      apagadas += r.apagadas;
      achadas += r.total;
    } catch (err) {
      log("WARN", "[THANOS] canal falhou", { canal: canal.id, erro: err.message });
      pulados.push(canal);
    }
    feitos++;

    // aviso a cada 15s (evita estourar rate limit de editar mensagem)
    if (onProgress && Date.now() - ultimoAviso > 15000) {
      ultimoAviso = Date.now();
      await Promise.resolve(onProgress({ canais: canais.length, feitos, apagadas, achadas })).catch(() => {});
    }
  }

  log("WARN", "[THANOS] concluído", { guild: guild.id, alvo: userId, apagadas, achadas, canais: feitos });
  return {
    ok: true,
    apagadas,
    achadas,
    canais: canais.length,
    pulados: pulados.length,
    teto: apagadas >= MAX_APAGAR_THANOS,
  };
}

// -------------------------------------------------------------
// TONY — backup das mensagens
// -------------------------------------------------------------
function resumirMensagem(m) {
  return {
    id: m.id,
    autorId: m.author?.id || null,
    autor: m.author?.tag || m.author?.username || "desconhecido",
    bot: !!m.author?.bot,
    conteudo: m.content || "",
    criadoEm: m.createdAt ? m.createdAt.toISOString() : null,
    editadoEm: m.editedAt ? m.editedAt.toISOString() : null,
    anexos: [...(m.attachments?.values?.() || [])].map((a) => ({
      nome: a.name,
      url: a.url,
      tamanho: a.size,
      tipo: a.contentType || null,
    })),
    respondeA: m.reference?.messageId || null,
    fixada: !!m.pinned,
  };
}

async function mensagensDoCanal(canal, limite) {
  const mensagens = [];
  let antes = null;

  while (mensagens.length < limite) {
    const quanto = Math.min(100, limite - mensagens.length);
    let pagina;
    try {
      pagina = await canal.messages.fetch({ limit: quanto, before: antes, cache: false });
    } catch (err) {
      log("WARN", "[TONY] falha ao ler canal", { canal: canal.id, erro: err.message });
      break;
    }
    if (!pagina.size) break;
    for (const m of pagina.values()) mensagens.push(resumirMensagem(m));
    antes = pagina.last()?.id || null;
    if (pagina.size < quanto) break;
    await dormir(PAUSA);
  }
  return mensagens;
}

// Tópicos = threads (fóruns) e threads soltas de canal de texto.
// Junta as ativas (vêm do guild, não do canal) com as arquivadas.
async function topicosDoCanal(canal, ativasPorPai) {
  const lista = [];
  const vistos = new Set();

  for (const t of ativasPorPai.get(canal.id) || []) {
    if (!t || vistos.has(t.id)) continue;
    vistos.add(t.id);
    lista.push({ thread: t, arquivada: false });
  }

  if (!canal.threads?.fetchArchived) return lista;

  for (const tipo of ["public", "private"]) {
    let antes = null;
    for (;;) {
      let pagina;
      try {
        pagina = await canal.threads.fetchArchived({
          type: tipo,
          limit: 100,
          ...(antes ? { before: antes } : {}),
        });
      } catch {
        break; // canal sem esse tipo de thread ou sem permissão
      }
      const novas = [...pagina.threads.values()].filter((t) => !vistos.has(t.id));
      for (const t of novas) {
        vistos.add(t.id);
        lista.push({ thread: t, arquivada: true });
      }
      if (!pagina.hasMore || !novas.length) break;
      const ultimo = novas[novas.length - 1];
      antes = ultimo?.archivedAt ? ultimo.archivedAt.toISOString() : null;
      if (!antes) break;
      await dormir(PAUSA);
    }
  }

  return lista;
}

async function tony(
  guild,
  { canalId = null, categoriaIds = null, incluirTopicos = null, limitePorCanal = 1000, onProgress = null } = {}
) {
  const cats = Array.isArray(categoriaIds) && categoriaIds.length ? categoriaIds.map(String) : null;
  // categoria sem dizer nada = copia os tópicos junto (fórum é onde o texto mora)
  const topicos = incluirTopicos == null ? !!cats : !!incluirTopicos;
  const canais = canaisDeTexto(guild, { canalId, categoriaIds: cats, incluirForuns: true });
  if (!canais.length) return { ok: false, erro: "não achei canal que eu consiga ler nesse escopo." };

  const limite = Math.min(Math.max(1, limitePorCanal), MAX_MSGS_TONY);
  const backup = {
    protocolo: "tony",
    geradoEm: new Date().toISOString(),
    guild: { id: guild.id, nome: guild.name },
    escopo: cats ? { categorias: cats } : canalId ? { canal: canalId } : { servidor: true },
    limitePorCanal: limite,
    incluirTopicos: topicos,
    categorias: (cats || []).map((id) => ({
      id,
      nome: guild.channels.cache.get(id)?.name || null,
    })),
    canais: [],
    totalMensagens: 0,
    totalMensagensTopicos: 0,
    totalTopicos: 0,
  };

  // threads ativas vêm do servidor inteiro: uma chamada só
  const ativasPorPai = new Map();
  if (topicos) {
    try {
      const ativas = await guild.channels.fetchActiveThreads();
      for (const t of ativas.threads.values()) {
        const arr = ativasPorPai.get(t.parentId) || [];
        arr.push(t);
        ativasPorPai.set(t.parentId, arr);
      }
    } catch (err) {
      log("WARN", "[TONY] threads ativas falharam", { guild: guild.id, erro: err.message });
    }
  }

  let ultimoAviso = 0;

  for (const canal of canais) {
    const mensagens = await mensagensDoCanal(canal, limite);
    const entrada = {
      id: canal.id,
      nome: canal.name,
      tipo: nomeDoTipo(canal.type),
      categoriaId: canal.parentId || null,
      mensagens,
    };

    if (topicos) {
      entrada.topicos = [];
      const lista = await topicosDoCanal(canal, ativasPorPai);
      for (const { thread, arquivada } of lista) {
        const msgs = await mensagensDoCanal(thread, limite);
        entrada.topicos.push({
          id: thread.id,
          nome: thread.name,
          arquivada,
          criadoEm: thread.createdAt ? thread.createdAt.toISOString() : null,
          mensagens: msgs,
        });
        backup.totalMensagens += msgs.length;
        backup.totalMensagensTopicos += msgs.length;
        backup.totalTopicos++;
      }
    }

    backup.canais.push(entrada);
    backup.totalMensagens += mensagens.length;

    if (onProgress && Date.now() - ultimoAviso > 15000) {
      ultimoAviso = Date.now();
      await Promise.resolve(
        onProgress({
          canais: canais.length,
          feitos: backup.canais.length,
          total: backup.totalMensagens,
          topicos: backup.totalTopicos,
        })
      ).catch(() => {});
    }
  }

  fs.mkdirSync(DIR_BACKUPS, { recursive: true });
  const arquivo = path.join(DIR_BACKUPS, `tony_${guild.id}_${carimbo()}.json`);
  fs.writeFileSync(arquivo, JSON.stringify(backup, null, 2), "utf8");
  const bytes = fs.statSync(arquivo).size;

  const vazios = backup.canais.filter(
    (c) => !c.mensagens.length && !(c.topicos || []).some((t) => t.mensagens.length)
  ).length;

  log("INFO", "[TONY] backup gerado", {
    guild: guild.id,
    arquivo,
    total: backup.totalMensagens,
    topicos: backup.totalTopicos,
    bytes,
  });
  return {
    ok: true,
    arquivo,
    bytes,
    total: backup.totalMensagens,
    totalTopicos: backup.totalTopicos,
    totalMensagensTopicos: backup.totalMensagensTopicos,
    canais: backup.canais.length,
    vazios,
  };
}

// -------------------------------------------------------------
// TONY pela API — job em segundo plano
// -------------------------------------------------------------
// O /protocolo tony é interativo e some quando a interação expira. Pra
// rodar um backup grande (servidor de cópia, 300+ canais) sem abrir um
// segundo gateway, a API dispara o Tony aqui e consulta o status.
// Só um job por vez: dois Tony juntos estouram rate limit e duplicam
// arquivos.
let jobTony = null;

function statusTony() {
  if (!jobTony) return { rodando: false };
  return { rodando: jobTony.status === "rodando", ...jobTony };
}

function iniciarTonyApi({ guildId, canalId = null, categoriaIds = null, incluirTopicos = null, limitePorCanal = 1000 } = {}) {
  if (jobTony && jobTony.status === "rodando") {
    return { ok: false, erro: "já tem um Tony rodando — espera terminar (GET /api/protocolo/tony)." };
  }
  if (!guildId) return { ok: false, erro: "guildId é obrigatório." };

  let client;
  try {
    ({ client } = require("./client"));
  } catch (err) {
    return { ok: false, erro: `não consegui pegar a conexão do Discord: ${err.message}` };
  }
  if (!client?.isReady?.()) return { ok: false, erro: "o Discord ainda não conectou." };

  const guild = client.guilds.cache.get(String(guildId));
  if (!guild) return { ok: false, erro: `não estou no servidor ${guildId}.` };

  jobTony = {
    status: "rodando",
    guildId: guild.id,
    guildNome: guild.name,
    canalId: canalId || null,
    categoriaIds: Array.isArray(categoriaIds) ? categoriaIds.map(String) : null,
    iniciadoEm: Date.now(),
    progresso: null,
    resultado: null,
    erro: null,
  };

  tony(guild, {
    canalId: canalId || null,
    categoriaIds: Array.isArray(categoriaIds) && categoriaIds.length ? categoriaIds : null,
    incluirTopicos,
    limitePorCanal,
    onProgress: (p) => {
      if (jobTony?.status === "rodando") jobTony.progresso = { ...p, em: Date.now() };
    },
  })
    .then((r) => {
      jobTony = {
        ...jobTony,
        status: r.ok ? "concluido" : "erro",
        resultado: r,
        erro: r.ok ? null : r.erro || "falhou",
        terminadoEm: Date.now(),
      };
    })
    .catch((err) => {
      jobTony = { ...jobTony, status: "erro", erro: err.message, terminadoEm: Date.now() };
      log("WARN", "[TONY] job da API falhou", { guild: guildId, erro: err.message });
    });

  log("INFO", "[TONY] job da API iniciado", {
    guild: guild.id,
    canal: canalId || "todos",
    categorias: categoriaIds || null,
    topicos: incluirTopicos,
    limitePorCanal,
  });
  return { ok: true, job: statusTony() };
}

// -------------------------------------------------------------
// EMILIA — guarda e retira os cargos
// -------------------------------------------------------------
function carregarEmilia() {
  try {
    const d = JSON.parse(fs.readFileSync(ARQ_EMILIA, "utf8"));
    return d && typeof d === "object" ? d : {};
  } catch {
    return {};
  }
}

function salvarEmilia(d) {
  fs.mkdirSync(path.dirname(ARQ_EMILIA), { recursive: true });
  fs.writeFileSync(ARQ_EMILIA, JSON.stringify(d, null, 2), "utf8");
}

const chaveEmilia = (guildId, userId) => `${guildId}:${userId}`;

// "30m" | "2h" | "7d" | "3s" (semanas) | "permanente"/vazio = null
function duracaoDe(texto) {
  const t = String(texto ?? "").trim().toLowerCase();
  if (!t || /^(perm|permanente|sempre|infinito|inf)$/.test(t)) return null;
  const m = t.match(/^(\d{1,4})\s*(m|min|minutos?|h|horas?|d|dias?|s|sem|semanas?)$/);
  if (!m) return undefined; // inválido
  const fator = { m: 1, min: 1, minuto: 1, minutos: 1, h: 60, hora: 60, horas: 60, d: 1440, dia: 1440, dias: 1440, s: 10080, sem: 10080, semana: 10080, semanas: 10080 };
  const unidade = m[2];
  const minutos = parseInt(m[1], 10) * (fator[unidade] || 1);
  if (minutos < 1 || minutos > 525600) return undefined; // teto de 1 ano
  return minutos;
}

function descreverDuracao(minutos) {
  if (minutos == null) return "permanente (até você mandar devolver)";
  if (minutos % 10080 === 0) return `${minutos / 10080} semana(s)`;
  if (minutos % 1440 === 0) return `${minutos / 1440} dia(s)`;
  if (minutos % 60 === 0) return `${minutos / 60} hora(s)`;
  return `${minutos} minuto(s)`;
}

async function emilia(guild, userId, { duracao = null, motivo = "Sem motivo informado", autor = null } = {}) {
  const membro = await guild.members.fetch(userId).catch(() => null);
  if (!membro) return { ok: false, erro: "essa pessoa não está no servidor." };
  if (membro.id === guild.client.user.id) return { ok: false, erro: "não vou tirar os cargos de mim mesma." };
  if (membro.id === guild.ownerId) return { ok: false, erro: "não dá pra tirar os cargos do dono do servidor." };

  const eu = guild.members.me;
  if (!eu?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, erro: "eu não tenho **Gerenciar Cargos** neste servidor." };
  }
  if (!membro.manageable) {
    return {
      ok: false,
      erro: `não consigo mexer em **${membro.user.tag}**: o cargo mais alto dele é igual/acima do meu. Sobe o cargo da Neon.`,
    };
  }

  const cargos = [...membro.roles.cache.values()]
    .filter((r) => r.id !== guild.id)
    .map((r) => ({ id: r.id, nome: r.name, perigoso: cargoPerigoso(r) }));

  if (!cargos.length) return { ok: false, erro: "essa pessoa não tem nenhum cargo pra guardar." };

  const expiraEm = duracao == null ? null : Date.now() + duracao * 60000;
  const d = carregarEmilia();
  const chave = chaveEmilia(guild.id, userId);

  // Se já existia um registro, ele é a versão mais antiga: preserva pra não
  // perder cargos que foram guardados antes e não voltaram.
  const anterior = d[chave];
  d[chave] = {
    guildId: guild.id,
    userId,
    tag: membro.user.tag,
    cargos: anterior ? [...anterior.cargos, ...cargos.filter((c) => !anterior.cargos.some((a) => a.id === c.id))] : cargos,
    criadoEm: Date.now(),
    expiraEm,
    duracaoMin: duracao,
    motivo,
    autorId: autor?.id || null,
    autorTag: autor?.tag || null,
    tentativas: 0,
  };
  salvarEmilia(d);

  try {
    await membro.roles.set([], `Protocolo Emilia (${motivo}) — por ${autor?.tag || "dono"}`);
  } catch (err) {
    // não deu pra tirar: mantém o registro (não perde nada) e avisa
    return { ok: false, erro: `guardei os cargos mas não consegui tirar: ${err.message}` };
  }

  log("WARN", "[EMILIA] cargos retirados", {
    guild: guild.id,
    alvo: userId,
    cargos: d[chave].cargos.length,
    expiraEm,
    autor: autor?.id,
  });

  return {
    ok: true,
    cargos: d[chave].cargos,
    expiraEm,
    duracaoTxt: descreverDuracao(duracao),
    jaExistia: !!anterior,
  };
}

async function restaurar(guild, userId, { motivo = null } = {}) {
  const d = carregarEmilia();
  const chave = chaveEmilia(guild.id, userId);
  const reg = d[chave];
  if (!reg) return { ok: false, erro: "não tenho cargos guardados dessa pessoa." };

  // conta a tentativa já aqui: se a pessoa sumiu do servidor, também conta,
  // senão o vigia tentaria pra sempre e mandaria DM a cada minuto.
  reg.tentativas = (reg.tentativas || 0) + 1;
  reg.ultimaTentativa = Date.now();
  salvarEmilia(d);

  const membro = await guild.members.fetch(userId).catch(() => null);
  if (!membro) {
    return { ok: false, erro: "essa pessoa não está no servidor — quando voltar, roda de novo.", registro: reg };
  }

  const eu = guild.members.me;
  if (!eu?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, erro: "eu não tenho **Gerenciar Cargos** neste servidor.", registro: reg };
  }

  const devolvidos = [];
  const falharam = [];

  for (const salvo of reg.cargos) {
    const cargo = guild.roles.cache.get(salvo.id) || (await guild.roles.fetch(salvo.id).catch(() => null));
    if (!cargo) {
      falharam.push({ id: salvo.id, nome: salvo.nome, motivo: "cargo não existe mais" });
      continue;
    }
    if (eu.roles.highest.comparePositionTo(cargo) <= 0) {
      falharam.push({ id: cargo.id, nome: cargo.name, motivo: "cargo acima do meu" });
      continue;
    }
    if (cargo.managed) {
      falharam.push({ id: cargo.id, nome: cargo.name, motivo: "cargo de integração" });
      continue;
    }
    try {
      await membro.roles.add(cargo, `Protocolo Emilia — devolução${motivo ? ` (${motivo})` : ""}`);
      devolvidos.push(cargo.name);
    } catch (err) {
      falharam.push({ id: cargo.id, nome: cargo.name, motivo: err.message });
    }
    await dormir(250);
  }

  reg.devolvidos = devolvidos;
  reg.falharam = falharam;

  if (!falharam.length) {
    delete d[chave];
  } else {
    // mantém só o que ainda falta, pra poder tentar de novo
    const faltando = new Set(falharam.map((f) => f.id));
    reg.cargos = reg.cargos.filter((c) => faltando.has(c.id));
    d[chave] = reg;
  }
  salvarEmilia(d);

  log("INFO", "[EMILIA] devolução", {
    guild: guild.id,
    alvo: userId,
    devolvidos: devolvidos.length,
    falharam: falharam.map((f) => f.nome),
  });

  return { ok: devolvidos.length > 0 || !falharam.length, devolvidos, falharam, registro: reg };
}

function listarEmilia(guildId = null) {
  const d = carregarEmilia();
  return Object.values(d)
    .filter((r) => !guildId || r.guildId === guildId)
    .sort((a, b) => a.criadoEm - b.criadoEm);
}

// -------------------------------------------------------------
// devolução automática dos temporários
// -------------------------------------------------------------
let intervalo = null;

async function verificarVencidos(client) {
  const d = carregarEmilia();
  const agora = Date.now();
  const vencidos = Object.values(d).filter(
    (r) => r.expiraEm && r.expiraEm <= agora && (r.tentativas || 0) < 10
  );
  for (const reg of vencidos) {
    const guild = client.guilds.cache.get(reg.guildId);
    if (!guild) continue;
    const r = await restaurar(guild, reg.userId, { motivo: "tempo do protocolo acabou" }).catch((err) => ({
      ok: false,
      erro: err.message,
    }));
    // DM só na primeira tentativa e quando dá certo: senão vira spam
    const primeira = (reg.tentativas || 0) === 0;
    if (reg.autorId && (r.ok || primeira) && client.isReady?.()) {
      const linhas = r.ok
        ? `✅ Devolvi **${(r.devolvidos || []).length}** cargo(s) de **${reg.tag || reg.userId}** (protocolo Emilia acabou).`
        : `⚠️ Protocolo Emilia de **${reg.tag || reg.userId}** venceu, mas não deu pra devolver tudo: ${r.erro || (r.falharam || []).map((f) => f.nome).join(", ")}`;
      client.users
        .fetch(reg.autorId)
        .then((u) => u.send(linhas))
        .catch(() => {});
    }
  }
}

function iniciar(client) {
  if (intervalo) clearInterval(intervalo);
  // no boot, confere o que venceu enquanto a Neon estava fora
  setTimeout(() => verificarVencidos(client).catch(() => {}), 8000);
  intervalo = setInterval(() => verificarVencidos(client).catch(() => {}), 60000);
  log("INFO", "[EMILIA] vigia de devolução ligado (60s)");
}

module.exports = {
  thanos,
  tony,
  emilia,
  restaurar,
  listarEmilia,
  iniciar,
  iniciarTonyApi,
  statusTony,
  verificarVencidos,
  canaisDeTexto,
  duracaoDe,
  descreverDuracao,
  DIR_BACKUPS,
  ARQ_EMILIA,
  MAX_APAGAR_THANOS,
  MAX_MSGS_TONY,
};
