// =============================================================
// AUTOMOD - motor de warn, punicao, mute e antiraid
// -------------------------------------------------------------
// Persistencia em data/automod.json (por servidor):
//  - warns: contagem + historico por usuario
//  - punicoes: escala progressiva (mute -> kick -> ban)
//  - antiraid: deteccao de entrada em massa (burst de joins)
//  - filtros: spam, convite, mencao em massa, caps, zalgo, links
//
// Regras:
//  - Staff/owner nunca entra no filtro.
//  - Nunca pune quem tem permissao de moderar.
//  - O log de modacao vai pro canal configurado (ou procurado pelo nome).
// =============================================================
const fs = require("fs");
const path = require("path");
const { PermissionFlagsBits } = require("discord.js");
const { log } = require("./logger");

const ARQUIVO = path.join(__dirname, "..", "data", "automod.json");
const NOMES_CANAL_LOG = ["mod-log", "modlogs", "moderação", "moderacao", "logs-mod", "staff", "staff-log"];

const ESCALA_PADRAO = [
  { warns: 1, acao: "timeout", minutos: 10 },
  { warns: 2, acao: "timeout", minutos: 60 },
  { warns: 3, acao: "timeout", minutos: 1440 },
  { warns: 4, acao: "kick", motivo: "4 warns" },
  { warns: 5, acao: "ban", apagarDias: 7, motivo: "5 warns" },
];

const ANTIRAID_PADRAO = {
  ativo: false,
  maxJoins: 5,
  janelaSegundos: 20,
  minIdadeDias: 7,
  acao: "kick",
  punirExcesso: true,
  limiteExcesso: 3,
};

const FILTROS_PADRAO = {
  ativo: true,
  convites: true,
  mencaoMassa: true,
  maxMencoes: 5,
  caps: true,
  maxCaps: 12,
  zalgo: true,
  maxZalgo: 12,
  links: false,
  dominiosBloqueados: [],
  flood: true,
  maxMensagens: 6,
  janelaMs: 7000,
  palavras: [],
  ignorarCanais: [],
  cargosLiberados: [],
};

const CFG_PADRAO = {
  enabled: false,
  avisarNoCanal: true,
  dmAoPunir: true,
  escala: ESCALA_PADRAO,
  antiraid: ANTIRAID_PADRAO,
  filtros: FILTROS_PADRAO,
};

let cache = null;

function carregar() {
  if (cache) return cache;
  try {
    if (fs.existsSync(ARQUIVO)) {
      cache = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
    } else {
      cache = { servidores: {}, warns: {} };
    }
    if (!cache.servidores) cache.servidores = {};
    if (!cache.warns) cache.warns = {};
  } catch (err) {
    log("ERROR", "[AUTOMOD] Falha ao carregar", { erro: err.message });
    cache = { servidores: {}, warns: {} };
  }
  return cache;
}

let gravando = false;
function persistir() {
  const d = carregar();
  try {
    if (!fs.existsSync(path.dirname(ARQUIVO))) fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
    if (gravando) return;
    gravando = true;
    fs.writeFileSync(ARQUIVO, JSON.stringify(d, null, 2), "utf8");
  } catch (err) {
    log("ERROR", "[AUTOMOD] Falha ao salvar", { erro: err.message });
  } finally {
    gravando = false;
  }
}

// ---------- configuracao por servidor ----------

function configGuild(guildId) {
  const d = carregar();
  if (!d.servidores[guildId]) d.servidores[guildId] = structuredClone(CFG_PADRAO);
  const c = d.servidores[guildId];
  if (!c.escala) c.escala = structuredClone(ESCALA_PADRAO);
  if (!c.antiraid) c.antiraid = structuredClone(ANTIRAID_PADRAO);
  if (!c.filtros) c.filtros = structuredClone(FILTROS_PADRAO);
  if (!Array.isArray(c.filtros.palavras)) c.filtros.palavras = [];
  if (!Array.isArray(c.filtros.ignorarCanais)) c.filtros.ignorarCanais = [];
  if (!Array.isArray(c.filtros.cargosLiberados)) c.filtros.cargosLiberados = [];
  if (!Array.isArray(c.filtros.dominiosBloqueados)) c.filtros.dominiosBloqueados = [];
  return c;
}

function canalLog(guild) {
  const d = carregar();
  const salvo = d.servidores[guild.id]?.canalLogId;
  if (salvo) {
    const c = guild.channels.cache.get(salvo);
    if (c) return c;
  }
  return (
    guild.channels.cache.find(
      (c) => NOMES_CANAL_LOG.includes(c.name.toLowerCase().replace(/\s+/g, "-")) && c.isTextBased()
    ) || null
  );
}

function setCanalLog(guildId, channelId) {
  const d = carregar();
  if (!d.servidores[guildId]) d.servidores[guildId] = structuredClone(CFG_PADRAO);
  d.servidores[guildId].canalLogId = channelId;
  persistir();
}

// ---------- permissoes ----------

function ehStaff(guild, member) {
  if (!member) return true;
  if (member.id === guild.ownerId) return true;
  const P = PermissionFlagsBits;
  return (
    member.permissions?.has(P.Administrator) ||
    member.permissions?.has(P.ModerateMembers) ||
    member.permissions?.has(P.ManageMessages) ||
    member.permissions?.has(P.KickMembers) ||
    member.permissions?.has(P.BanMembers) ||
    member.permissions?.has(P.ManageGuild)
  );
}

function podeSerPunido(guild, member) {
  if (!member) return false;
  if (member.id === guild.ownerId) return false;
  const botId = guild.client?.user?.id;
  if (botId && member.id === botId) return false;
  if (!member.moderatable) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return false;
  if (ehStaff(guild, member)) return false;
  return true;
}

function isLiberado(guild, member) {
  const cfg = configGuild(guild.id);
  const liberados = cfg.filtros.cargosLiberados;
  if (!liberados.length) return false;
  if (!member) return false;
  return member.roles.cache.some((r) => liberados.includes(r.id));
}

// ---------- logs ----------

function barra(texto) {
  return String(texto || "-").slice(0, 1000);
}

async function registrarLog(guild, { cor, titulo, campos, arquivo }) {
  const canal = canalLog(guild);
  const embed = {
    color: cor || 0x9b59b6,
    title: titulo,
    fields: Object.entries(campos || {})
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .slice(0, 25)
      .map(([k, v]) => ({ name: String(k).slice(0, 256), value: barra(v), inline: true })),
    timestamp: new Date().toISOString(),
    footer: { text: guild.name },
  };
  if (canal?.isTextBased()) {
    await canal.send({ embeds: [embed], files: arquivo ? [arquivo] : undefined }).catch(() => {});
  } else {
    log("INFO", "[AUTOMOD] sem canal de log", { guild: guild.name, titulo });
  }
}

// ---------- warns ----------

function registroWarn(guildId, userId) {
  const d = carregar();
  const chave = `${guildId}:${userId}`;
  if (!d.warns[chave]) d.warns[chave] = { guildId, userId, total: 0, ativo: 0, historico: [] };
  const r = d.warns[chave];
  if (!Array.isArray(r.historico)) r.historico = [];
  return r;
}

function contarWarns(guildId, userId) {
  const d = carregar();
  const r = d.warns[`${guildId}:${userId}`];
  if (!r) return { total: 0, ativo: 0, historico: [] };
  return r;
}

async function darWarn(guild, user, motivo, autor, opts = {}) {
  const r = registroWarn(guild.id, user.id);
  r.total += 1;
  r.ativo += 1;
  r.historico.push({
    em: Date.now(),
    motivo: String(motivo || "sem motivo").slice(0, 500),
    autor: opts.autorId || autor?.id || null,
    autorTag: autor?.user?.tag || autor?.tag || null,
    automatico: !!opts.automatico,
    tipo: opts.tipo || "manual",
  });
  if (r.historico.length > 100) r.historico = r.historico.slice(-100);
  persistir();

  const cfg = configGuild(guild.id);
  const regra = resolverEscala(cfg.escala, r.ativo);
  const member = await guild.members.fetch(user.id).catch(() => null);

  const linhas = [`**${r.ativo}º warn** — total histórico: ${r.total}`, `📄 Motivo: ${motivo || "sem motivo"}`];
  if (regra) linhas.push(punicaoTexto(regra, r.ativo));

  if (cfg.avisarNoCanal && member) {
    const canal = member.guild.channels.cache.get(opts.channelId);
    if (canal?.isTextBased()) {
      await canal
        .send({
          content: `⚠️ <@${user.id}> ${linhas.join("\n")}${opts.automatico ? "\n🤖 Aplicado automaticamente." : `\n👤 Por ${autor?.user?.tag || autor?.tag || "staff"}.`}`,
          allowedMentions: { users: [user.id] },
        })
        .catch(() => {});
    }
  }

  if (cfg.dmAoPunir && member && !member.user.bot) {
    await member.user
      .send(
        `⚠️ Você recebeu um aviso no **${guild.name}**.\n📄 Motivo: ${motivo || "sem motivo"}${
          regra ? `\n🔨 Punição: ${punicaoTexto(regra, r.ativo)}` : ""
        }`
      )
      .catch(() => {});
  }

  await registrarLog(guild, {
    cor: 0xf1c40f,
    titulo: opts.automatico ? "⚠️ Warn automático" : "⚠️ Warn aplicado",
    campos: {
      Usuário: `${user.tag || user.username}\n\`${user.id}\``,
      Motivo: motivo,
      Warn: `${r.ativo}º (total ${r.total})`,
      Tipo: opts.tipo,
      Moderador: opts.autorTag || autor?.user?.tag || autor?.tag,
    },
  });

  if (regra && member && podeSerPunido(guild, member)) {
    await aplicarPunicao(guild, member, regra, `warn ${r.ativo}: ${motivo}`);
  }

  return { warn: r.ativo, total: r.total, punicao: regra || null };
}

function resolverEscala(escala, n) {
  if (!Array.isArray(escala) || !escala.length) return null;
  const ordenada = [...escala].sort((a, b) => (a.warns || 0) - (b.warns || 0));
  let alvo = null;
  for (const regra of ordenada) {
    if (n >= (regra.warns || 0)) alvo = regra;
  }
  return alvo;
}

function punicaoTexto(regra, n) {
  if (!regra) return "Sem punição automática neste nível.";
  if (regra.acao === "timeout") return `🔇 Silenciado por ${regra.minutos} min.`;
  if (regra.acao === "kick") return "👢 Expulso do servidor.";
  if (regra.acao === "ban") return `🔨 Banido${regra.apagarDias ? ` (${regra.apagarDias}d de mensagens apagadas)` : ""}.`;
  return regra.acao;
}

async function aplicarPunicao(guild, member, regra, motivo) {
  const cfg = configGuild(guild.id);
  if (!podeSerPunido(guild, member)) {
    log("WARN", "[AUTOMOD] alvo não punível", { guild: guild.name, usuario: member.id });
    return { ok: false, erro: "Alvo não pode ser punido." };
  }
  const motivoFinal = `${String(motivo || regra.motivo || "automod").slice(0, 450)} (Neon automod)`;
  try {
    if (regra.acao === "timeout") {
      const ms = Math.min(Math.max(Number(regra.minutos) || 10, 1), 40320) * 60000;
      await member.timeout(ms, motivoFinal);
    } else if (regra.acao === "kick") {
      await member.kick(motivoFinal);
    } else if (regra.acao === "ban") {
      await guild.members.ban(member.id, {
        reason: motivoFinal,
        deleteMessageSeconds: Math.min(Math.max(Number(regra.apagarDias) || 0, 0), 7) * 86400,
      });
    } else {
      return { ok: false, erro: `Ação desconhecida: ${regra.acao}` };
    }
  } catch (err) {
    await registrarLog(guild, {
      cor: 0xe74c3c,
      titulo: "❌ Falha ao punir",
      campos: { Usuário: `${member.user.tag}\n\`${member.id}\``, Ação: regra.acao, Erro: err.message },
    });
    return { ok: false, erro: err.message };
  }

  if (cfg.dmAoPunir && !member.user.bot) {
    await member.user
      .send(
        `🔨 **${guild.name}**\nAção: ${punicaoTexto(regra)}\n📄 Motivo: ${motivoFinal}`
      )
      .catch(() => {});
  }
  await registrarLog(guild, {
    cor: regra.acao === "ban" ? 0xe74c3c : regra.acao === "kick" ? 0xe67e22 : 0x3498db,
    titulo: "🔨 Punição automática",
    campos: {
      Usuário: `${member.user.tag}\n\`${member.id}\``,
      Ação: punicaoTexto(regra),
      Motivo: motivoFinal,
    },
  });
  log("INFO", "[AUTOMOD] punição aplicada", { guild: guild.name, usuario: member.id, acao: regra.acao });
  return { ok: true, acao: regra.acao };
}

function limparWarns(guildId, userId, tudo = false) {
  const d = carregar();
  const chave = `${guildId}:${userId}`;
  if (tudo) {
    delete d.warns[chave];
  } else {
    const r = d.warns[chave];
    if (r) r.ativo = 0;
  }
  persistir();
}

function historico(guildId, userId, limite = 10) {
  return contarWarns(guildId, userId).historico.slice(-limite).reverse();
}

// ---------- antiraid ----------

const joins = new Map(); // guildId -> [timestamps]

function registrarJoin(guild, member) {
  const cfg = configGuild(guild.id);
  const ar = cfg.antiraid;
  const agora = Date.now();

  if (!ar.ativo) return null;
  if (!isLiberado(guild, member) && !ehStaff(guild, member) && member.id !== guild.client?.user?.id) {
    const chave = guild.id;
    if (!joins.has(chave)) joins.set(chave, []);
    const lista = joins.get(chave);
    lista.push(agora);
    const limite = agora - ar.janelaSegundos * 1000;
    while (lista.length && lista[0] < limite) lista.shift();

    if (lista.length > ar.maxJoins) {
      const excesso = lista.length - ar.maxJoins;
      const muitoNovo = member.user.createdTimestamp > agora - ar.minIdadeDias * 86400000;
      if (muitoNovo) {
        if (ar.punirExcesso && excesso % Math.max(1, ar.limiteExcesso) === 0) {
          punirEntrada(member, ar.acao, "conta muito nova em entrada em massa");
        }
        return { raid: true, total: lista.length, contaNova: true };
      }
      return { raid: true, total: lista.length, contaNova: false };
    }
  }
  return null;
}

async function punirEntrada(member, acao, motivo) {
  if (!podeSerPunido(member.guild, member)) return;
  const final = `${motivo} (antiraid)`;
  try {
    if (acao === "ban") {
      await member.guild.members.ban(member.id, { reason: final, deleteMessageSeconds: 0 });
    } else if (acao === "timeout") {
      await member.timeout(60 * 60000, final);
    } else {
      await member.kick(final);
    }
  } catch {
    return;
  }
  log("INFO", "[AUTOMOD] antiraid", { guild: member.guild.name, usuario: member.id, acao });
}

// ---------- filtro de mensagens ----------

const historicoMsg = new Map(); // userId:channelId -> [ts]

// message.member e imutavel (getter); guarda o membro completo aqui pra
// os filtros verem cargo/permissao mesmo em servidores grandes.
const membrosResolvidos = new WeakMap();

function aplicarNoMembro(message, member) {
  if (member) membrosResolvidos.set(message, member);
}

function membroDe(message) {
  return membrosResolvidos.get(message) || message.member || null;
}

function checarMensagem(message) {
  const cfg = configGuild(message.guild.id);
  if (!cfg.enabled || !cfg.filtros.ativo) return null;
  if (message.author.bot) return null;
  const membro = membroDe(message);
  if (ehStaff(message.guild, membro)) return null;
  if (isLiberado(message.guild, membro)) return null;
  if (cfg.filtros.ignorarCanais.includes(message.channel.id)) return null;

  const texto = String(message.content || "");
  const f = cfg.filtros;
  const base = { guild: message.guild, user: message.author, member: membro, message };

  if (f.convites && /discord(?:app)?\.com\/invite\/[\w-]{2,}|discord\.gg\/[\w-]{2,}/i.test(texto)) {
    return { tipo: "convite", acao: "timeout", minutos: 60, ...base };
  }
  const mencoes = message.mentions.users.size + message.mentions.roles.size;
  if (f.mencaoMassa && mencoes > f.maxMencoes) {
    return { tipo: "mencaoMassa", acao: "timeout", minutos: 120, ...base };
  }
  const letras = texto.replace(/[^a-zA-Z]/g, "");
  if (f.caps && letras.length >= 12 && letras === letras.toUpperCase()) {
    return { tipo: "caps", acao: "aviso", ...base };
  }
  if (f.zalgo) {
    const zalgo = (texto.match(/[\u0300-\u036f]/g) || []).length;
    if (zalgo > f.maxZalgo) return { tipo: "zalgo", acao: "timeout", minutos: 30, ...base };
  }
  if (f.dominiosBloqueados.length) {
    const links = texto.match(/https?:\/\/[^\s]+/gi) || [];
    for (const link of links) {
      const host = (() => {
        try {
          return new URL(link).hostname.toLowerCase();
        } catch {
          return null;
        }
      })();
      if (!host) continue;
      if (f.dominiosBloqueados.some((d) => host === d || host.endsWith(`.${d}`))) {
        return { tipo: "linkBloqueado", acao: "timeout", minutos: 60, ...base };
      }
    }
  }
  if (f.links && /https?:\/\/[^\s]+/i.test(texto)) {
    return { tipo: "link", acao: "aviso", ...base };
  }
  if (f.palavras.length) {
    const alvo = `${texto} ${message.author.username}`.toLowerCase();
    const achou = f.palavras.find((p) => p && alvo.includes(String(p).toLowerCase()));
    if (achou) return { tipo: "palavraProibida", acao: "timeout", minutos: 120, palavra: achou, ...base };
  }
  if (f.flood) {
    const chave = `${message.author.id}:${message.channel.id}`;
    if (!historicoMsg.has(chave)) historicoMsg.set(chave, []);
    const lista = historicoMsg.get(chave);
    const agora = Date.now();
    lista.push(agora);
    while (lista.length && lista[0] < agora - f.janelaMs) lista.shift();
    if (lista.length > f.maxMensagens) {
      return { tipo: "flood", acao: "timeout", minutos: 10, ...base };
    }
  }
  return null;
}

async function aplicarFiltro(violacao) {
  const { guild, user, message } = violacao;
  await message.delete().catch(() => {});

  if (violacao.acao === "aviso") {
    await registrarLog(guild, {
      cor: 0xf39c12,
      titulo: `🔎 Filtro: ${violacao.tipo} (aviso)`,
      campos: {
        Usuário: `${user.tag}\n\`${user.id}\``,
        Canal: `#${message.channel.name}`,
        Conteúdo: message.content,
      },
    });
    return;
  }

  const member = violacao.member || (await guild.members.fetch(user.id).catch(() => null));
  if (member && podeSerPunido(guild, member)) {    await darWarn(guild, user, `automod: ${violacao.tipo}${violacao.palavra ? ` (${violacao.palavra})` : ""}`, null, {
      automatico: true,
      tipo: violacao.tipo,
      autorId: guild.client.user.id,
      channelId: message.channel.id,
    });
  }
  log("INFO", "[AUTOMOD] filtro aplicado", { guild: guild.name, tipo: violacao.tipo, usuario: user.id });
}

// ---------- manutencao ----------

function limpar() {
  cache = null;
  joins.clear();
  historicoMsg.clear();
}

module.exports = {
  carregar,
  persistir,
  configGuild,
  setCanalLog,
  canalLog,
  ehStaff,
  podeSerPunido,
  isLiberado,
  darWarn,
  contarWarns,
  historico,
  limparWarns,
  resolverEscala,
  punicaoTexto,
  aplicarPunicao,
  registrarJoin,
  checarMensagem,
  aplicarFiltro,
  aplicarNoMembro,
  membroDe,
  registrarLog,
  limpar,
  CFG_PADRAO,
  ESCALA_PADRAO,
  ANTIRAID_PADRAO,
  FILTROS_PADRAO,
};
