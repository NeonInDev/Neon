// =============================================================
// AUTOMOD - motor de warn, punicao, mute e antiraid
// -------------------------------------------------------------
// Persistencia em data/automod.json (por servidor):
//  - warns: contagem + historico por usuario
//  - punicoes: escala progressiva (mute -> kick -> ban)
//  - antiraid: deteccao de entrada em massa (burst de joins)
//  - filtros: spam, convite, mencao em massa, zalgo, links
//
// Regras:
//  - Staff/owner nunca entra no filtro.
//  - Nunca pune quem tem permissao de moderar.
//  - O log de modacao vai pro canal configurado (ou procurado pelo nome).
// =============================================================
const fs = require("fs");
const path = require("path");
const { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { log } = require("./logger");

const ARQUIVO = path.join(__dirname, "..", "data", "automod.json");
const NOMES_CANAL_LOG = ["mod-log", "modlogs", "moderação", "moderacao", "logs-mod", "staff", "staff-log"];

// Lista pedida pelo dono: xingamentos e ofensas. A comparacao ignora
// acento e maiuscula e casa por substring, entao "estuprado" tambem pega
// "estúprada", "estuprar", "abusado" e as abreviacoes.
const PALAVRAS_PADRAO = [
  "estuprado",
  "estuprando",
  "estuprar",
  "molestar",
  "molestado",
  "abusado",
  "absd",
  "strpd",
  "mcc",
  "macaco",
  "diddy",
  "kid bengala",
  "jeffrey",
  "epstein",
  "stu pro",
  "stu prado",
];

// Sobe esse numero sempre que o dono trocar a lista acima.
const VERSAO_PALAVRAS = 3;

// tira acento e deixa minusculo, pra "estuprado" pegar "estúprado" tambem
function normalizar(txt) {
  return String(txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// adds a lista padrao de palavras proibidas sem duplicar nem apagar as
// que o staff ja configurou a mao
function semearPalavras(guildId) {
  const c = configGuild(guildId);
  if (!Array.isArray(c.filtros.palavras)) c.filtros.palavras = [];
  const atuais = new Set(c.filtros.palavras.map((p) => normalizar(p)));
  let novas = 0;
  for (const p of PALAVRAS_PADRAO) {
    if (!atuais.has(normalizar(p))) {
      c.filtros.palavras.push(p);
      atuais.add(normalizar(p));
      novas += 1;
    }
  }
  persistir();
  return novas;
}

const punicoes = require("./punicoes");
const ESCALA_PADRAO = punicoes.ESCALA_PUNICAO;

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
  caps: false,
  maxCaps: 0,
  zalgo: true,
  maxZalgo: 12,
  links: false,
  dominiosBloqueados: [],
  flood: true,
  maxMensagens: 6,
  janelaMs: 7000,
  palavras: [],
  excecoes: [],
  ignorarCanais: [],
  semFlood: [],
  semConvite: [],
  contextoIa: true,
  contextoIaFallback: "punir",
  cargosLiberados: [],
};

// =============================================================
// CARGOS INSPIRAVEIS
// -------------------------------------------------------------
// Cargos de chamada (Instagram, Twitter, Acontecimentos...) que so podem
// ser marcados no canal certo e de tempos em tempos. Quebrar a regra da
// um "warn inspiravel": conta separado, some em 1 mes e vale metade da
// punicao normal.
// =============================================================
const MIN = 60 * 1000;
const CARGOS_INSPIRAVEIS_PADRAO = [
  {
    id: "1498218757233967125",
    nome: "Instagram",
    canais: ["1498404746053029999"],
    pessoalMs: 0,
    globalMs: 0,
  },
  {
    id: "1498218739319963738",
    nome: "Twitter",
    canais: ["1498404746053029999"],
    pessoalMs: 0,
    globalMs: 0,
  },
  {
    id: "1498218702863204392",
    nome: "Acontecimentos",
    canais: ["1498172516055912530"],
    pessoalMs: 10 * MIN, // o mesmo nao repete em 10m
    globalMs: 0,
  },
  {
    id: "1498218554120605827",
    nome: "Trocas e Doações",
    canais: ["1498206618406621184"],
    pessoalMs: 2 * 60 * MIN, // o mesmo espera 2h
    globalMs: 10 * MIN, // mas ninguem marca antes de 10m
  },
  {
    id: "1498218513809276998",
    nome: "Chamar RP",
    canais: ["1498207785098416178"],
    pessoalMs: 0, // sem intervalo pessoal
    globalMs: 10 * MIN,
  },
];

const CFG_PADRAO = {
  enabled: false,
  avisarNoCanal: true,
  dmAoPunir: true,
  // kick e ban NUNCA sao automaticos: viram pedido e esperam o Admin
  // confirmar. Ate la a pessoa fica so com mute temporario.
  confirmarPunicao: true,
  timeoutPendente: 40320,
  escala: ESCALA_PADRAO,
  antiraid: ANTIRAID_PADRAO,
  filtros: FILTROS_PADRAO,
  cargosInspiraveis: {
    ativo: true,
    lista: CARGOS_INSPIRAVEIS_PADRAO,
    // warn inspiravel: conta separado, "leve", e some depois de 1 mes
    diasParaSumir: 30,
  },
};

let cache = null;

function carregar() {
  if (cache) return cache;
  try {
    if (fs.existsSync(ARQUIVO)) {
      cache = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
    } else {
      cache = { servidores: {}, warns: {}, pendentes: {} };
    }
    if (!cache.servidores) cache.servidores = {};
    if (!cache.warns) cache.warns = {};
    if (!cache.pendentes) cache.pendentes = {};
  } catch (err) {
    log("ERROR", "[AUTOMOD] Falha ao carregar", { erro: err.message });
    cache = { servidores: {}, warns: {}, pendentes: {} };
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
  // a escada tem 10 niveis na versao do dono; se a config do servidor ainda
  // tem a antiga de 5, troca pela nova (so quando o dono nao editou na mao)
  if (Array.isArray(c.escala) && c.escala.length && c.escala.length !== ESCALA_PADRAO.length) {
    c.escala = structuredClone(ESCALA_PADRAO);
    persistir();
  }
  if (!c.antiraid) c.antiraid = structuredClone(ANTIRAID_PADRAO);
  if (!c.filtros) c.filtros = structuredClone(FILTROS_PADRAO);
  // os cargos inspiraveis chegaram depois dos servidores ja configurados,
  // entao quem ja tinha config precisa receber a lista nova
  if (!c.cargosInspiraveis || !Array.isArray(c.cargosInspiraveis.lista)) {
    c.cargosInspiraveis = structuredClone(CFG_PADRAO.cargosInspiraveis);
    persistir();
  }
  // o filtro de caps lock foi removido a pedido do dono: quem ainda tinha
  // ligado precisa desligar, senao a config fica mentindo
  if (c.filtros.caps) {
    c.filtros.caps = false;
    c.filtros.maxCaps = 0;
    persistir();
  }
  if (!Array.isArray(c.filtros.palavras)) c.filtros.palavras = [];
  if (!Array.isArray(c.filtros.excecoes)) c.filtros.excecoes = [];
  if (!Array.isArray(c.filtros.semFlood)) c.filtros.semFlood = [];
  if (!Array.isArray(c.filtros.semConvite)) c.filtros.semConvite = [];
  if (!Array.isArray(c.filtros.ignorarCanais)) c.filtros.ignorarCanais = [];
  if (!Array.isArray(c.filtros.cargosLiberados)) c.filtros.cargosLiberados = [];
  if (!Array.isArray(c.filtros.dominiosBloqueados)) c.filtros.dominiosBloqueados = [];
  // A lista de palavras tem dono: o codigo. Quando o dono troca a lista,
  // sobe a versao e o proximo boot substitui a antiga. Palavras add depois
  // pelo /mod sobrevivem, porque a versao ja bate.
  if (c.filtros.versaoPalavras !== VERSAO_PALAVRAS) {
    c.filtros.palavras = [...PALAVRAS_PADRAO];
    c.filtros.versaoPalavras = VERSAO_PALAVRAS;
    persistir();
  }
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

// =============================================================
// WARN INSPIRAVEL
// -------------------------------------------------------------
// Contador separado do warn normal. Guarda o horario de cada infracao
// pra poder esquecer as velhas: passado o prazo (1 mes por padrao) a
// infracao simplesmente some da conta, sem zerar as novas.
// =============================================================
function inspiravel(guildId, userId) {
  const d = carregar();
  if (!d.warnsInspiraveis) d.warnsInspiraveis = {};
  const chave = `${guildId}:${userId}`;
  if (!d.warnsInspiraveis[chave]) d.warnsInspiraveis[chave] = { guildId, userId, datas: [] };
  const r = d.warnsInspiraveis[chave];
  if (!Array.isArray(r.datas)) r.datas = [];
  return r;
}

// joga fora as infracoes que ja venceram, e devolve quantas sobraram
function limparInspiraveisVencidos(guildId, userId, dias) {
  const cfg = configGuild(guildId).cargosInspiraveis || {};
  const prazo = (Number(dias ?? cfg.diasParaSumir) || 30) * 24 * 60 * 60 * 1000;
  const r = inspiravel(guildId, userId);
  const agora = Date.now();
  const antes = r.datas.length;
  r.datas = r.datas.filter((t) => agora - t < prazo);
  return { ativas: r.datas.length, apagadas: antes - r.datas.length };
}

// quantas marcacoes o cargo aceitou (vale so a ultima, e so pro intervalo)
function contarInspiraveis(guildId, userId) {
  const { ativas } = limparInspiraveisVencidos(guildId, userId);
  return { ativas };
}

function ultimaMarcacao(guildId, cargoId) {
  const d = carregar();
  if (!d.marcacoesCargo) d.marcacoesCargo = {};
  return d.marcacoesCargo[`${guildId}:${cargoId}`] || 0;
}

function marcarCargo(guildId, cargoId, userId) {
  const d = carregar();
  if (!d.marcacoesCargo) d.marcacoesCargo = {};
  const chave = `${guildId}:${cargoId}`;
  d.marcacoesCargo[chave] = { global: Date.now(), pessoa: userId };
  d.marcacoesCargo[`${chave}:${userId}`] = Date.now();
}

function ultimaMarcacaoPessoa(guildId, cargoId, userId) {
  const d = carregar();
  if (!d.marcacoesCargo) d.marcacoesCargo = {};
  return d.marcacoesCargo[`${guildId}:${cargoId}:${userId}`] || 0;
}

// marca o uso valido do cargo. so acontece quando a marcacao passou em tudo
function registrarMarcacaoValida(guildId, cargoId, userId) {
  const d = carregar();
  if (!d.marcacoesCargo) d.marcacoesCargo = {};
  d.marcacoesCargo[`${guildId}:${cargoId}`] = Date.now();
  d.marcacoesCargo[`${guildId}:${cargoId}:${userId}`] = Date.now();
  persistir();
}

// =============================================================
// A REGRA EM SI
// -------------------------------------------------------------
// Le as marcacoes da mensagem e devolve as quebradas. Cada quebra tem
// o cargo, o motivo e quanto tempo faltou/faltava.
// =============================================================
function normalizarParaRx(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// detecta mencao de verdade (<@&id>) e tambem o nome digitado com @
function cargosMarcados(message) {
  const said = new Set();
  for (const r of message.mentions?.roles?.values?.() || []) said.add(String(r.id));
  const texto = normalizarParaRx(message.content || "");
  return said;
}

function checarCargosInspiraveis(message) {
  const cfg = configGuild(message.guild.id).cargosInspiraveis;
  if (!cfg?.ativo || !Array.isArray(cfg.lista) || !cfg.lista.length) return null;

  const marcados = cargosMarcados(message);
  if (!marcados.size) return null;

  const texto = normalizarParaRx(message.content || "");
  const guildId = message.guild.id;
  const userId = message.author.id;
  const canalId = message.channel?.id;
  const agora = Date.now();
  const quebras = [];
  const validos = [];

  for (const regra of cfg.lista) {
    const id = String(regra?.id || "");
    if (!id) continue;

    let foiMarcado = marcados.has(id);
    // alem da mencao de verdade, pega o nome digitado com @ antes
    if (!foiMarcado) {
      const nome = normalizarParaRx(regra.nome || "");
      if (nome) {
        const rx = new RegExp(`(^|\\s)@?${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
        if (rx.test(texto)) foiMarcado = true;
      }
    }
    if (!foiMarcado) continue;

    // 1) so pode marcar no canal indicado
    const canais = Array.isArray(regra.canais) ? regra.canais.map(String) : [];
    if (canais.length && !canais.includes(String(canalId))) {
      quebras.push({ cargo: regra, motivo: "canal", canais });
      continue;
    }

    // 2) intervalo pessoal: o proprio nao repete
    const pessoal = Number(regra.pessoalMs) || 0;
    if (pessoal > 0) {
      const ultima = ultimaMarcacaoPessoa(guildId, id, userId);
      const faltam = ultima ? ultima + pessoal - agora : 0;
      if (ultima && faltam > 0) {
        quebras.push({ cargo: regra, motivo: "pessoal", faltam });
        continue;
      }
    }

    // 3) intervalo global: ninguem marca antes de todo mundo
    const global = Number(regra.globalMs) || 0;
    if (global > 0) {
      const ultima = ultimaMarcacao(guildId, id);
      const faltam = ultima ? ultima + global - agora : 0;
      if (ultima && faltam > 0) {
        quebras.push({ cargo: regra, motivo: "global", faltam });
        continue;
      }
    }

    validos.push({ regra, id });
  }

  // so marca o uso valido depois que o usuario foi avisado das quebradas
  for (const v of validos) registrarMarcacaoValida(guildId, v.id, userId);
  if (!quebras.length) return null;
  return { quebras, validos: validos.length };
}

function textoQuebra(q) {
  const nome = q.cargo?.nome || "cargo";
  if (q.motivo === "canal") {
    return `O cargo **${nome}** só pode ser marcado em ${q.canais.map((c) => `<#${c}>`).join(" ou ")}.`;
  }
  if (q.motivo === "pessoal") {
    const min = Math.ceil(q.faltam / 60000);
    return `Você já marcou o cargo **${nome}**. Faltavam ${min} min do intervalo de 10 min.`;
  }
  const min = Math.ceil(q.faltam / 60000);
  return `O cargo **${nome}** foi marcado há pouco. Faltam ${min} min do intervalo global.`;
}

// =============================================================
// CONTA DOBRADA
// =============================================================
// Regra do dono: a staff, que fica ENTRE "Equipe Staff" e o cargo da
// propria Neon ("Robotizado"), conta 2 warns por infracao. Abaixo de
// Equipe Staff (membro comum) conta normal, e em cima da Neon tambem.
// O owner do servidor fica sempre de fora.
const POS_EQUIPE_STAFF = 210; // usado se o cargo nao for encontrado
const POS_ROBOTIZADO = 222; // usado se o cargo nao for encontrado
const ID_ROBOTIZADO = "1498212857555451945";

function ehOwner(guild, user) {
  return !!user && !!guild && user.id === guild.ownerId;
}

// procura a posicao de um cargo por id e por nome, para sobreviver a
// reordenacao de cargos e a troca de nome no servidor
function posCargo(guild, { id, rx, fallback }) {
  const lista = guild?.roles?.cache;
  if (id && typeof lista?.get === "function") {
    const porId = lista.get(id);
    if (Number.isFinite(porId?.position)) return porId.position;
  }
  if (rx && typeof lista?.find === "function") {
    const alvo = lista.find((r) => rx.test(r?.name || ""));
    if (Number.isFinite(alvo?.position)) return alvo.position;
  }
  return fallback;
}

const posEquipeStaff = (guild) => posCargo(guild, { rx: /equipe\s*staff/i, fallback: POS_EQUIPE_STAFF });
const posRobotizado = (guild) => posCargo(guild, { id: ID_ROBOTIZADO, rx: /robotizado/i, fallback: POS_ROBOTIZADO });

function contaDobrada(guild, member) {
  if (!member) return false;
  if (ehOwner(guild, member)) return false;
  const topo = member.roles?.highest?.position;
  if (!Number.isFinite(topo)) return false;
  // faixa da staff: acima de Equipe Staff e abaixo do Robotizado
  return topo > posEquipeStaff(guild) && topo < posRobotizado(guild);
}

// =============================================================
// WARN INSPIRAVEL
// -------------------------------------------------------------
// Conta separada, punição leve: metade do mute, controle desce so ate
// a metade do caminho, e nunca expulsa nem bane. As infracoes somem
// depois de 1 mes, entao so conta o que aconteceu de verdade no mes
// corrente.
// =============================================================
async function darWarnInspiravel(guild, user, motivo, quebras, opts = {}) {
  const cfg = configGuild(guild.id);
  const member = opts.member || (await guild.members.fetch(user.id).catch(() => null));
  if (ehOwner(guild, member || user)) {
    log("INFO", "[INSPIRAVEL] owner ignorado", { guild: guild.name, usuario: user.id });
    return { warn: 0, owner: true };
  }

  const r = inspiravel(guild.id, user.id);
  r.datas.push(Date.now());
  const { ativas, apagadas } = limparInspiraveisVencidos(guild.id, user.id, cfg.cargosInspiraveis?.diasParaSumir);
  persistir();

  const nivel = punicoes.nivelInspiravel(ativas);
  const detalhes = quebras.map(textoQuebra).join("\n");

  await registrarLog(guild, {
    cor: 0x8e44ad,
    titulo: "💜 Warn inspirável (punição leve)",
    campos: {
      Usuário: `${user.tag || user.username}\n\`${user.id}\``,
      Canal: opts.channelId ? `<#${opts.channelId}>` : "—",
      "O que foi feito": quebras
        .map((q) => `• ${q.cargo?.nome} — ${{ canal: "fora do canal", pessoal: "intervalo pessoal", global: "intervalo global" }[q.motivo]}`)
        .join("\n"),
      "Contador": `${ativas} warn(s) inspirável(is)${apagadas ? ` (${apagadas} velha(s) de mais de 1 mês já sumiram)` : ""}`,
      "Punição": punicaoTexto(nivel, ativas) + " — metade da punição normal, e nunca expulsa nem bane",
      "Aviso ao usuário": detalhes,
    },
  });

  // aplica metade do nivel
  let aplicado = { feito: [], erros: [], avisos: [] };
  if (member) {
    try {
      aplicado = await punicoes.aplicarNivel(guild, member, nivel, { meio: true });
    } catch (err) {
      aplicado = { feito: [], erros: [err.message], avisos: [] };
    }
  }

  const texto = `💜 **Warn inspirável ${ativas}º** (punição leve, vale metade)\n${detalhes}\n🔨 ${punicaoTexto(nivel, ativas)}`;

  if (cfg.avisarNoCanal && member && opts.channelId) {
    const canal = member.guild.channels.cache.get(opts.channelId);
    if (canal?.isTextBased()) {
      await canal.send({ content: `${texto}\n🤖 Aplicado automaticamente.`, allowedMentions: { users: [user.id] } }).catch(() => {});
    }
  }
  if (cfg.dmAoPunir && member && !member.user.bot) {
    await member.user.send(`💜 **Warn inspirável** no **${guild.name}**\n${texto}`).catch(() => {});
  }

  log("INFO", "[INSPIRAVEL] warn aplicado", {
    guild: guild.name,
    usuario: user.id,
    contador: ativas,
    quebras: quebras.length,
    nivel: nivel.warns,
  });

  return { warn: ativas, ativas, apagadas, nivel, aplicado, detalhes, texto };
}

// atalho pro messageCreate: marca fora da regra e devolve true
async function marcouCargoForaDaRegra(message) {
  const r = await aplicarCargosInspiraveis(message);
  return !!r;
}

// aplica a regra: se a mensagem quebrou algo, da o warn e para
async function aplicarCargosInspiraveis(message) {
  const guild = message.guild;
  if (!guild || !message.author || message.author.bot) return null;
  const cfg = configGuild(guild.id);
  if (!cfg.cargosInspiraveis?.ativo) return null;
  // staff e o dono nao sao presos nessa regra
  const member = message.member;
  if (!member) return null;
  if (ehStaff(guild, member)) return null;

  const r = checarCargosInspiraveis(message);
  if (!r) return null;

  const user = message.member.user || { id: message.author.id, tag: message.author.tag, username: message.author.username, bot: false };
  return await darWarnInspiravel(guild, user, "marcou cargo de chamada fora da regra", r.quebras, {
    member,
    channelId: message.channel?.id,
  });
}

async function darWarn(guild, user, motivo, autor, opts = {}) {
  const r = registroWarn(guild.id, user.id);
  const member = opts.member || (await guild.members.fetch(user.id).catch(() => null));
  // o owner nunca entra na contagem, nem automatica
  if (ehOwner(guild, member || user)) {
    log("INFO", "[AUTOMOD] owner ignorado na contagem", { guild: guild.name, usuario: user.id });
    return { warn: 0, total: r.total, punicao: null, owner: true };
  }
  const dobro = contaDobrada(guild, member);
  const passo = dobro ? 2 : 1;
  r.total += passo;
  r.ativo += passo;
  r.historico.push({
    em: Date.now(),
    motivo: String(motivo || "sem motivo").slice(0, 500),
    autor: opts.autorId || autor?.id || null,
    autorTag: autor?.user?.tag || autor?.tag || null,
    automatico: !!opts.automatico,
    tipo: opts.tipo || "manual",
    peso: passo,
  });
  if (r.historico.length > 100) r.historico = r.historico.slice(-100);
  persistir();

  const cfg = configGuild(guild.id);
  const regra = resolverEscala(cfg.escala, r.ativo);

  const linhas = [
    `**${r.ativo}º warn** — total histórico: ${r.total}`,
    ...(dobro ? ["**conta dobrada** (você está abaixo do cargo da staff)"] : []),
    `📄 Motivo: ${motivo || "sem motivo"}`,
  ];
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
      Warn: `${r.ativo}º (total ${r.total})${dobro ? " — conta dobrada" : ""}`,
      Tipo: opts.tipo,
      Moderador: opts.autorTag || autor?.user?.tag || autor?.tag,
    },
  });

  if (regra && member && podeSerPunido(guild, member)) {
    await aplicarPunicao(guild, member, regra, `warn ${r.ativo}: ${motivo}`);
  }

  return { warn: r.ativo, total: r.total, punicao: regra || null, dobro };
}

function resolverEscala(escala, n) {
  if (!Array.isArray(escala) || !escala.length) return null;
  const ordenada = [...escala].sort((a, b) => (a.warns || 0) - (b.warns || 0));
  let alvo = null;
  for (const regra of ordenada) {
    if (n >= (regra.warns || 0)) alvo = regra;
  }
  if (!alvo) return null;
  // a escala do dono traz o nivel completo (controle, ranques, arcane);
  // em levels com acao (kick/ban) a confirmacao de Admin continua valendo
  if (alvo.acao) return alvo;
  return { ...alvo, nivel: alvo };
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

  // kick e ban exigem confirmacao de um Admin: vira pedido e a pessoa fica
  // so com mute temporario ate alguem com Administrador decidir
  if (cfg.confirmarPunicao && (regra.acao === "kick" || regra.acao === "ban")) {
    return await pedirConfirmacao(guild, member, regra, motivoFinal);
  }

  // ---- escada de punicao do dono ----
  // Cada nivel mexe no nick (controle), nos cargos de atributo e no Arcane,
  // alem do mute. Vale quando a regra tem "nivel" (veio de ESCALA_PUNICAO).
  if (regra.nivel && !regra.acao) {
    const { aplicarNivel } = require("./punicoes");
    const r = await aplicarNivel(guild, member, regra, { dobro: !!regra.dobro });
    if (cfg.dmAoPunir && !member.user.bot) {
      await member.user
        .send(
          `🔨 **${guild.name}**\n${regra.texto}\n` +
            (r.feito.length ? `👥 ${r.feito.join("\n👥 ")}` : "") +
            (r.avisos.length ? `\n${r.avisos.join("\n")}` : "")
        )
        .catch(() => {});
    }
    await registrarLog(guild, {
      cor: regra.acao === "ban" ? 0xe74c3c : 0xe67e22,
      titulo: `⚖️ ${regra.warns || regra.nivel.warns}º aviso`,
      campos: {
        Usuário: `${member.user.tag}\n\`${member.id}\``,
        "O que acontece": regra.texto,
        Aplicado: r.feito.join("\n") || "nada alterado",
        ...(r.avisos.length ? { Atencao: r.avisos.join("\n") } : {}),
        ...(r.erros.length ? { Erros: r.erros.join("\n") } : {}),
        Motivo: motivoFinal,
      },
    });
    log("INFO", "[AUTOMOD] punição aplicada", { guild: guild.name, usuario: member.id, nivel: regra.warns });
    return { ok: true, acao: "nivel", controle: r.controle, feito: r.feito, erros: r.erros };
  }

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

// =============================================================
// PEDIDO DE CONFIRMACAO (kick/ban)
// =============================================================
// Regra do dono: a Neon NUNCA expulsa nem bane sozinha. Ela silencia a
// pessoa e pergunta a um Administrador. Discord nao tem timeout
// permanente: o teto e 28 dias (40320 min), entao "permanente" aqui
// significa 28 dias, renovaveis quantas vezes o Admin quiser.
const TIMEOUT_MAX_MS = 40320 * 60000;

function ehAdmin(guild, user) {
  if (!user) return false;
  if (user.id === guild.ownerId) return true;
  const m = guild.members.cache.get(user.id);
  if (!m) return false;
  return m.permissions?.has(PermissionFlagsBits.Administrator) === true;
}

async function pedirConfirmacao(guild, member, regra, motivoFinal) {
  const d = carregar();
  if (!d.pendentes[guild.id]) d.pendentes[guild.id] = {};
  const cfg = configGuild(guild.id);

  const min = Math.min(Math.max(Number(cfg.timeoutPendente) || 40320, 1), 40320);
  let muteOk = true;
  try {
    await member.timeout(TIMEOUT_MAX_MS, `${motivoFinal} — aguardando confirmação do Admin`);
  } catch {
    muteOk = false;
  }

  d.pendentes[guild.id][member.id] = {
    userId: member.id,
    userTag: member.user.tag,
    acao: regra.acao,
    motivo: motivoFinal,
    apagarDias: regra.apagarDias || 0,
    pedidoEm: Date.now(),
    muteAplicado: muteOk,
    minutosMute: min,
  };
  persistir();

  const aviso = await registrarLogComBotoes(guild, {
    cor: 0xe74c3c,
    titulo: `⏸️ Pedido de ${regra.acao === "ban" ? "BAN" : "KICK"} — aguardando Admin`,
    campos: {
      Usuário: `${member.user.tag}\n\`${member.id}\``,
      "Ação pedida": punicaoTexto(regra, 0),
      Motivo: motivoFinal,
      "Enquanto espera": muteOk
        ? `🔇 silenciado por ${min} min (teto do Discord)`
        : "⚠️ não consegui silenciar (cargo acima do meu?)",
    },
    guildId: guild.id,
    userId: member.id,
  });

  if (cfg.dmAoPunir && !member.user.bot) {
    await member.user
      .send(
        `⏸️ **${guild.name}**\nUm pedido de ${regra.acao === "ban" ? "ban" : "kick"} foi aberto pra você.\n` +
          `📄 Motivo: ${motivoFinal}\n🔇 Enquanto um administrador não confirma, você fica só silenciado.`
      )
      .catch(() => {});
  }

  log("WARN", "[AUTOMOD] punição aguardando Admin", {
    guild: guild.name,
    usuario: member.id,
    acao: regra.acao,
    aviso: aviso ? "pedido criado" : "sem canal de log",
  });
  return { ok: true, acao: "pendente", pedido: regra.acao, muteAplicado: muteOk };
}

async function registrarLogComBotoes(guild, dados) {
  const canal = canalLog(guild);
  if (!canal?.isTextBased()) return null;
  const embed = {
    color: dados.cor,
    title: dados.titulo,
    fields: Object.entries(dados.campos || {})
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .slice(0, 25)
      .map(([k, v]) => ({ name: String(k).slice(0, 256), value: barra(v), inline: true })),
    timestamp: new Date().toISOString(),
    footer: { text: guild.name },
  };
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`automod:aprovar:${dados.guildId}:${dados.userId}`)
      .setLabel("Confirmar (Admin)")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔨"),
    new ButtonBuilder()
      .setCustomId(`automod:recusar:${dados.guildId}:${dados.userId}`)
      .setLabel("Recusar e liberar o mute")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅")
  );
  return canal.send({ embeds: [embed], components: [row] }).catch(() => null);
}

function listarPendentes(guildId) {
  const d = carregar();
  return Object.values(d.pendentes?.[guildId] || {});
}

function pendente(guildId, userId) {
  return carregar().pendentes?.[guildId]?.[userId] || null;
}

async function decidirPuncao(guild, userId, aprovar, aprovador) {
  const d = carregar();
  const p = d.pendentes?.[guild.id]?.[userId];
  if (!p) return { ok: false, erro: "Não há pedido pendente desse usuário." };
  if (!ehAdmin(guild, aprovador)) {
    return { ok: false, erro: "Só o dono do servidor ou alguém com **Administrador** pode decidir." };
  }
  const member = await guild.members.fetch(userId).catch(() => null);
  const quem = `${aprovador.user?.tag || aprovador.tag} (${aprovador.id})`;
  let texto = "";

  if (aprovar) {
    try {
      if (p.acao === "ban") {
        await guild.members.ban(userId, {
          reason: `${p.motivo} — confirmado por ${quem}`,
          deleteMessageSeconds: Math.min(Math.max(Number(p.apagarDias) || 0, 0), 7) * 86400,
        });
        texto = `🔨 **${p.userTag}** foi **banido**.`;
      } else {
        if (!member) return { ok: false, erro: "A pessoa não está mais no servidor, então não dá para expulsar." };
        await member.kick(`${p.motivo} — confirmado por ${quem}`);
        texto = `👢 **${p.userTag}** foi **expulso**.`;
      }
    } catch (err) {
      return { ok: false, erro: `Falha ao executar: ${err.message}` };
    }
  } else {
    // recusou: o pedido estava errado, entao o mute temporario tambem cai
    if (member?.isCommunicationDisabled()) {
      await member.timeout(null, `Pedido recusado por ${quem}`).catch(() => {});
      texto = `✅ Pedido recusado. O mute de **${p.userTag}** foi retirado.`;
    } else {
      texto = `✅ Pedido recusado. **${p.userTag}** não estava silenciado.`;
    }
  }

  delete d.pendentes[guild.id][userId];
  persistir();

  await registrarLog(guild, {
    cor: aprovar ? 0xe74c3c : 0x2ecc71,
    titulo: aprovar ? `🔨 Punição confirmada por Admin` : `✅ Pedido recusado por Admin`,
    campos: {
      Usuário: `${p.userTag}\n\`${userId}\``,
      "Ação": aprovar ? punicaoTexto({ acao: p.acao }, 0) : "nenhuma (recusado)",
      Motivo: p.motivo,
      Decidiu: quem,
    },
  });
  log("INFO", "[AUTOMOD] pedido decidido", { guild: guild.name, usuario: userId, aprovar, quem });
  return { ok: true, texto, acao: p.acao };
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

  if (f.convites && !(f.semConvite || []).includes(message.channel.id) &&
      /discord(?:app)?\.com\/invite\/[\w-]{2,}|discord\.gg\/[\w-]{2,}/i.test(texto)) {
    return { tipo: "convite", acao: "timeout", minutos: 60, ...base };
  }
  const mencoes = message.mentions.users.size + message.mentions.roles.size;
  if (f.mencaoMassa && mencoes > f.maxMencoes) {
    return { tipo: "mencaoMassa", acao: "timeout", minutos: 120, ...base };
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
    const alvo = normalizar(`${texto} ${message.author.username} ${message.author.globalName || ""}`);
    // excecoes liberam frases legitimas (ex: "cabelo preto" em RP)
    if ((f.excecoes || []).some((e) => e && alvo.includes(normalizar(e)))) return null;
    const achou = f.palavras.find((p) => p && alvo.includes(normalizar(p)));
    if (achou) return { tipo: "palavraProibida", acao: "timeout", minutos: 120, palavra: achou, burlado: false, ...base };
    // nao casou no texto normal: tenta na forma burla (d1ddy, D.i.d.d.y)
    const disfarce = f.palavras.find((p) => p && palavraBurla(texto, p));
    if (disfarce) {
      return { tipo: "palavraProibida", acao: "timeout", minutos: 120, palavra: disfarce, burlado: true, ...base };
    }
  }
  if (f.flood && !(f.semFlood || []).includes(message.channel.id)) {
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

// Filtros que so avisam no chat: a mensagem NAO e apagada e NAO gera warn.
const SO_AVISO = ["link"];

// ---------- burla (filtro contornado) ----------
// Quem tenta escapar do filtro nao ganha o beneficio da duvida: a frase
// e a mesma, so que disfarçada. O filtro compara o texto normal E uma
// versao "burla" de cada palavra (d1ddy, D.i.d.d.y, 3pst31n...). Se casar
// so na burla, é tentativa de burlar: punição dobrada.
const LEET = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g",
  "@": "a", "$": "s", "!": "i", "|": "l", "+": "t", "*": "a", "^": "a", "&": "e", "<": "c", ">": "o",
};

function formaBurla(palavra) {
  return normalizar(palavra)
    .replace(/\s+/g, "") // "stu pro" vira "stupro"
    .replace(/[.\-_~`'"()[\]{}\/\\|!@$+*=^<>]/g, "") // separadores jogados fora
    .replace(/[0-9@$!|]/g, (c) => LEET[c] || c); // leet
}

function palavraBurla(texto, termo) {
  const alvo = formaBurla(termo);
  if (!alvo || alvo.length < 3) return false;
  // junta 1, 2 e 3 palavras seguidas: pega burla em termo com espaco
  // ("k1d b3ngala" -> "kidbengala") sem colar o texto todo
  const toks = String(texto || "").split(/\s+/).filter(Boolean).map(formaBurla);
  for (let i = 0; i < toks.length; i++) {
    for (let n = 1; n <= 3; n++) {
      if (i + n > toks.length) break;
      const junto = toks.slice(i, i + n).join("");
      if (junto.length >= alvo.length && junto.includes(alvo)) return true;
    }
  }
  return false;
}

// ---------- contexto local (antes da IA) ----------
// Casos obvios que o filtro estouraria por acidente. Resolver aqui evita
// gastar chamada de IA e garante liberacao mesmo com o Groq caido (429).
// Se a frase nao bate com nenhum destes padroes, a IA e quem decide.
const CONTEXTO_CLARO = [
  // cor / roupa / aparencia: "eu gosto de usar roupa preta", "cabelo preto"
  /\b(roupa|roupas|vestido|camisa|camiseta|calca|bermuda|meia|tenis|jaleco|jaqueta|casaco|blusa|saia|camisa|chapeu|boné|toca|faixa|cor|cores|pele|cabelo|cabelos|olhos|olho|sobrancelha|barba|bigode)\b[^.!?\n]{0,30}\b(preto|preta|pretos|pretas|negro|negra|negros|negras)\b/i,
  /\b(preto|preta|negro|negra|negros|negras)\b[^.!?\n]{0,30}\b(roupa|roupas|vestido|camisa|camiseta|calca|bermuda|meia|tenis|jaqueta|casaco|blusa|saia|cabelo|cabelos|olhos|sobrancelha|barba)\b/i,
  // "preto e branco", "ao vivo e em cores", "filme preto e branco"
  /\bpreto\s+e\s+branco\b/i,
  // referencia a midia/persona, nao a pessoa
  /\b(novela|filme|jogo|video|serie|musica|desenho|personagem|heroi|vilao|anime|story|feed|reels)\b/i,
  // ficha de RP / anuncio de parceria
  /\b(ficha|personagem|rp|roleplay|parceria|parcerias|recrutando|recrutamento|entra no|subindo no|server novo)\b/i,
  // Negocio de roupa / moda
  /\b(loja|roupa|moda|looks?|look|brechó|brecho|vestido|estampado|co look)\b/i,
  // falar de animal como animal: "sabe de macacos?", "vi um gato preto".
  // Precisa de verbo de observacao, senao "seu macaco" continuaria barrado.
  /\b(sabe|sabia|vi|ve|viu|sobre|existem|existia|zoo|zoológico|ficou|fugiu)\b[^.!?\n]{0,25}\b(macaco|macacos|macaca|bicho|primata|primatas|animal|animais|ave|aves|peixe|gato|gatos|cao|cachorro|macacos)\b/i,
];

// Trava o caso com certeza: se casou com um padrao local, a frase e legitima.
function contextoLocalmenteLegitimo(texto, termo) {
  const t = String(texto || "");
  if (!t) return null;
  const alvo = String(termo || "").toLowerCase();
  // so vale para termos que aparecem em contexto neutro; se o texto tem
  // xingamento claro ("idiota", "merda", "porra") ignora o atalho local
  if (/\b(idiota|imbecil|merda|porra|caralho|filha da puta|arrombado|desgraça)\b/i.test(t)) {
    return null;
  }
  for (const rx of CONTEXTO_CLARO) {
    if (rx.test(t)) {
      // garante que o termofiltrado realmente aparece na frase
      if (alvo && !normalizar(t).includes(normalizar(alvo))) continue;
      return true;
    }
  }
  return null;
}

async function aplicarFiltro(violacao) {
  const { guild, user, message } = violacao;

  // ---- a IA le a frase e decide se e ofensa de verdade ----
  // O filtro e burro: casa "preto" em "cabelo preto" e "roupa preta".
  // A IA roda ANTES de qualquer warn ou delete: se disser que a frase e
  // legitima, o texto fica no chat e ninguem ganha warn.
  if (violacao.tipo === "palavraProibida") {
    const cfg = configGuild(guild.id);
    const textoMsg = String(message.content || "");
    const local = contextoLocalmenteLegitimo(textoMsg, violacao.palavra);
    if (local) {
      await registrarLog(guild, {
        cor: 0x2ecc71,
        titulo: "🧠 Liberado pelo contexto local (sem gastar IA)",
        campos: {
          Usuário: `${user.tag}\n\`${user.id}\``,
          Canal: `#${message.channel.name}`,
          Palavra: `\`${violacao.palavra}\``,
          "Texto": textoMsg || "(vazio)",
          "Mensagem apagada": "não — texto mantido e sem warn",
        },
      });
      return;
    }
    if (cfg.filtros.contextoIa) {
      let veredito = null;
      try {
        const { avaliarContexto } = require("./contexto_ia");
        veredito = await avaliarContexto({
          texto: message.content,
          termo: violacao.palavra,
          filtro: "palavra proibida",
          canal: message.channel.name,
          autor: user.tag,
          ms: 5000,
        });
      } catch (err) {
        log("WARN", "[AUTOMOD] verificador de contexto falhou", { erro: err.message?.slice(0, 100) });
      }

      if (veredito?.decisao === "legitimo") {
        await registrarLog(guild, {
          cor: 0x2ecc71,
          titulo: "🧠 Liberado pelo verificador de contexto",
          campos: {
            Usuário: `${user.tag}\n\`${user.id}\``,
            Canal: `#${message.channel.name}`,
            Palavra: `\`${violacao.palavra}\``,
            "Texto": message.content || "(vazio)",
            "Por que liberou": veredito.razao || "(IA)",
            "Mensagem apagada": "não — texto mantido e sem warn",
          },
        });
        log("INFO", "[AUTOMOD] liberado pela IA", {
          guild: guild.name,
          usuario: user.id,
          palavra: violacao.palavra,
          razao: veredito.razao,
        });
        return;
      }

      if (veredito?.decisao === "ofensa") {
        await message.delete().catch(() => {});
        await registrarLog(guild, {
          cor: 0xe74c3c,
          titulo: "🧠 Ofensa confirmada pelo verificador de contexto",
          campos: {
            Usuário: `${user.tag}\n\`${user.id}\``,
            Canal: `#${message.channel.name}`,
            Palavra: `\`${violacao.palavra}\``,
            "Texto": message.content || "(vazio)",
            "Por que": veredito.razao || "(IA)",
          },
        });
        return aplicarPunicaoComWarn(guild, user, message, violacao);
      }
      if (cfg.filtros.contextoIaFallback === "ignorar") {
        await registrarLog(guild, {
          cor: 0x95a5a6,
          titulo: "⚠️ Sem veredito da IA (config: não punir)",
          campos: {
            Usuário: `${user.tag}\n\`${user.id}\``,
            Canal: `#${message.channel.name}`,
            Palavra: `\`${violacao.palavra}\``,
            "Texto": message.content || "(vazio)",
          },
        });
        return;
      }
      // sem veredito e fallback = punir: apaga e segue o caminho normal
    }
  }

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

  return aplicarPunicaoComWarn(guild, user, message, violacao);
}

async function aplicarPunicaoComWarn(guild, user, message, violacao) {
  const member = violacao.member || (await guild.members.fetch(user.id).catch(() => null));
  if (member && podeSerPunido(guild, member)) {
    const motivo = `automod: ${violacao.tipo}${violacao.palavra ? ` (${violacao.palavra})` : ""}${
      violacao.burlado ? " — TENTOU BURLAR O FILTRO" : ""
    }`;
    await darWarn(guild, user, motivo, null, {
      automatico: true,
      tipo: violacao.tipo,
      autorId: guild.client.user.id,
      channelId: message.channel.id,
      member,
    });
    // burlar o filtro = punição dobrada: conta o aviso duas vezes
    if (violacao.burlado) {
      await registrarLog(guild, {
        cor: 0x8e44ad,
        titulo: "🎭 Tentativa de burlar o filtro — punição dobrada",
        campos: {
          Usuário: `${user.tag}\n\`${user.id}\``,
          Canal: `#${message.channel.name}`,
          Palavra: `\`${violacao.palavra}\``,
          "Texto disfarçado": message.content || "(vazio)",
          "Como escreveu": message.content,
          Efeito: "conta 2 avisos na escala de uma vez",
        },
      });
      log("WARN", "[AUTOMOD] burla detectada", { guild: guild.name, usuario: user.id, palavra: violacao.palavra });
      // segundo aviso: é isso que dobra a punição na escada
      await darWarn(guild, user, `${motivo} (2º aviso: burla)`, null, {
        automatico: true,
        tipo: violacao.tipo,
        autorId: guild.client.user.id,
        channelId: message.channel.id,
        member,
      });
    }
  }
  // registra o texto barrado: sem isso o staff nao consegue dizer se foi
  // offense de verdade ou falso positivo (ex: "cabelo preto")
  await registrarLog(guild, {
    cor: 0xe67e22,
    titulo: `🚫 Filtro: ${violacao.tipo}`,
    campos: {
      Usuário: `${user.tag}\n\`${user.id}\``,
      Canal: `#${message.channel.name}`,
      Palavra: violacao.palavra ? `\`${violacao.palavra}\`` : undefined,
      "Texto barrado": message.content || "(vazio)",
    },
  });
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
  contaDobrada,
  ehOwner,
  isLiberado,
  darWarn,
  contarWarns,
  darWarnInspiravel,
  checarCargosInspiraveis,
  aplicarCargosInspiraveis,
  marcouCargoForaDaRegra,
  contarInspiraveis,
  limparInspiraveisVencidos,
  historico,
  limparWarns,
  resolverEscala,
  punicaoTexto,
  aplicarPunicao,
  listarPendentes,
  pendente,
  decidirPuncao,
  ehAdmin,
  registrarJoin,
  checarMensagem,
  aplicarFiltro,
  aplicarNoMembro,
  membroDe,
  registrarLog,
  limpar,
  semearPalavras,
  normalizar,
  PALAVRAS_PADRAO,
  CFG_PADRAO,
  ESCALA_PADRAO,
  ANTIRAID_PADRAO,
  FILTROS_PADRAO,
};
