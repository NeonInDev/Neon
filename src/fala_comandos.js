// Roteador de fala natural -> comandos slash da Neon.
// Mesmo padrão das skills: o usuário fala "Neon, me da a letra de X"
// e o comando /letra é executado através de uma interação fake que
// captura as respostas (reply/editReply/followUp) e devolve como texto.
const { ChannelType } = require("discord.js");
const commands = require("./commands");
const { db } = require("./db");
const { log } = require("./logger");
const { permitido, isGuest } = require("./perm");

function enderecada(message) {
  if (message.channel?.type === ChannelType.DM) return true;
  const t = String(message.content || "");
  if (message.mentions?.has(message.client.user?.id)) return true;
  return /^\s*neon[\s,!.\-:;]/i.test(t);
}

function limparDisparador(texto) {
  return String(texto || "")
    .trim()
    .replace(/^\s*(?:neon|<@!?\d+>)[\s,!.\-:;]*/i, "")
    .trim();
}

function resolverUsuario(message, texto) {
  const t = String(texto || "").trim();
  const m = t.match(/<@!?(\d+)>/);
  if (m) {
    const u = message.client.users.cache.get(m[1]);
    return u || { id: m[1], username: m[1], tag: m[1], bot: false };
  }
  const alvo = message.guild?.members?.cache?.find(
    (mem) => mem.user.username === t || mem.displayName === t
  );
  return alvo?.user || { id: t, username: t, tag: t, bot: false };
}

function criarInteracaoFake(message, args) {
  const saidas = [];
  let replied = false;
  const push = async (p) => {
    const conteudo = typeof p === "string" ? p : p?.content || "";
    if (conteudo) saidas.push(conteudo);
    return { createdTimestamp: Date.now(), channel: message.channel };
  };
  return {
    saidas,
    user: message.author,
    member: message.member,
    guild: message.guild,
    channel: message.channel,
    client: message.client,
    guildId: message.guild?.id ?? null,
    channelId: message.channel.id,
    createdTimestamp: Date.now(),
    inGuild: () => !!message.guild,
    replied,
    options: {
      getString: (n) => (n in args ? args[n] : null),
      getInteger: (n) => (n in args && args[n] != null ? Math.round(Number(args[n])) : null),
      getNumber: (n) => (n in args && args[n] != null ? Number(args[n]) : null),
      getBoolean: (n) => !!args[n],
      getUser: (n) => args[n] ?? null,
      getChannel: () => message.channel,
      getSubcommand: () => args._sub ?? null,
      getFocused: () => "",
    },
    reply: push,
    deferReply: async () => {},
    editReply: async (p) => {
      const conteudo = typeof p === "string" ? p : p?.content || "";
      if (saidas.length && conteudo && !replied) saidas[saidas.length - 1] = conteudo;
      else await push(p);
      replied = true;
    },
    followUp: (p) => push(p),
    respond: async () => {},
    showModal: async () => {
      throw new Error("esse comando exige modal no app (use a barra de comandos)");
    },
  };
}

function permitidoFala(message, command) {
  const uid = message.author.id;
  if (command.publico) return null;
  if (!permitido(uid)) return "❌ Acesso negado.";
  if (isGuest(uid)) return "👥 Convidados só podem conversar com a Neon.";
  if (command.adminOnly) {
    const mestre = db.data.users?.[uid];
    if (!mestre?.mestre) return "❌ acesso negado.";
  }
  return null;
}

async function enviarPartes(message, texto) {
  const conteudo = String(texto ?? "").trim();
  if (!conteudo) return;
  const MAX = 2000;
  const partes = [];
  let restante = conteudo;
  while (restante.length > MAX) {
    let corte = restante.lastIndexOf("\n", MAX);
    if (corte <= 0) corte = MAX;
    partes.push(restante.slice(0, corte));
    restante = restante.slice(corte).replace(/^\s+/, "");
  }
  if (restante) partes.push(restante);
  for (let i = 0; i < partes.length; i++) {
    if (i === 0) await message.reply(partes[i]).catch(() => {});
    else await message.channel.send(partes[i]).catch(() => {});
  }
}

function parseLetra(t) {
  const m = String(t || "").trim().match(/^(.+?)\s*(?:-|–|—)\s*(.+)$/);
  if (m) return { artista: m[1].trim(), musica: m[2].trim() };
  return { artista: "", musica: String(t || "").trim() };
}

const ROTAS = [
  {
    comando: "letra",
    padroes: [
      { re: /^(?:me\s+)?(?:manda|dá|da|qual\s*é)\s+a\s+letra\s+de\s+(.+)$/i, montar: (mm) => parseLetra(mm[1]) },
      { re: /^(?:a\s+)?letra\s+de\s+(.+)$/i, montar: (mm) => parseLetra(mm[1]) },
      { re: /^letra\s+(.+)$/i, montar: (mm) => parseLetra(mm[1]) },
    ],
  },
  {
    comando: "spotify",
    padroes: [
      { re: /^busca\s+(.+)\s+no\s+spotify$/i, montar: (mm) => ({ busca: mm[1].trim() }) },
      { re: /^procura\s+(.+)\s+no\s+spotify$/i, montar: (mm) => ({ busca: mm[1].trim() }) },
      { re: /^spotify\s+(.+)$/i, montar: (mm) => ({ busca: mm[1].trim() }) },
    ],
  },
  {
    comando: "youtube",
    padroes: [
      { re: /^busca\s+(.+)\s+no\s+youtube$/i, montar: (mm) => ({ busca: mm[1].trim() }) },
      { re: /^procura\s+(.+)\s+no\s+youtube$/i, montar: (mm) => ({ busca: mm[1].trim() }) },
      { re: /^yt\s+(.+)$/i, montar: (mm) => ({ busca: mm[1].trim() }) },
      { re: /^youtube\s+(.+)$/i, montar: (mm) => ({ busca: mm[1].trim() }) },
    ],
  },
  {
    comando: "google",
    padroes: [
      { re: /^google\s+status$/i, montar: () => ({ _sub: "status" }) },
      { re: /^agenda\s+(hoje|semana|proximos)$/i, montar: (mm) => ({ _sub: "agenda", quando: mm[1].toLowerCase() }) },
      { re: /^minha\s+agenda\s+de\s+hoje$/i, montar: () => ({ _sub: "agenda", quando: "hoje" }) },
      { re: /^minhas\s+tarefas$/i, montar: () => ({ _sub: "tarefas", acao: "listar" }) },
      { re: /^adiciona\s+tarefa\s+(.+)$/i, montar: (mm) => ({ _sub: "tarefas", acao: "criar", tarefa: mm[1].trim() }) },
      { re: /^conclui\s+tarefa\s+(.+)$/i, montar: (mm) => ({ _sub: "tarefas", acao: "concluir", tarefa: mm[1].trim() }) },
      { re: /^gmail$/i, montar: () => ({ _sub: "gmail", filtro: "recentes" }) },
      { re: /^emails?\s+n[aã]o\s+lidos$/i, montar: () => ({ _sub: "gmail", filtro: "nao_lidos" }) },
      { re: /^drive$/i, montar: () => ({ _sub: "drive", busca: "" }) },
      { re: /^procur[ao]\s+no\s+drive\s+(.+)$/i, montar: (mm) => ({ _sub: "drive", busca: mm[1].trim() }) },
    ],
  },
  {
    comando: "perfil",
    padroes: [
      { re: /^(?:me\s+mostra\s+|ve\s+)?perfil\s+de\s+(.+)$/i, montar: (mm, msg) => ({ usuario: resolverUsuario(msg, mm[1]) }) },
    ],
  },
  {
    comando: "info",
    padroes: [
      { re: /^info\s+sobre\s+(.+)$/i, montar: (mm) => ({ termo: mm[1].trim() }) },
      { re: /^lore\s+sobre\s+(.+)$/i, montar: (mm) => ({ termo: mm[1].trim() }) },
      { re: /^me\s+conta\s+sobre\s+o\s+lore\s+de\s+(.+)$/i, montar: (mm) => ({ termo: mm[1].trim() }) },
    ],
  },
  {
    comando: "ping",
    padroes: [
      { re: /^ping$/i, montar: () => ({}) },
      { re: /^lat[eê]ncia$/i, montar: () => ({}) },
      { re: /^qual\s+teu\s+ping$/i, montar: () => ({}) },
    ],
  },
  {
    comando: "id",
    padroes: [
      { re: /^id\s+do\s+canal$/i, montar: () => ({ _sub: "canal" }) },
      { re: /^id\s+da\s+mensagem\s+(.+)$/i, montar: (mm) => ({ _sub: "mensagem", link: mm[1].trim() }) },
      { re: /^id\s+do\s+(.+)$/i, montar: (mm, msg) => ({ _sub: "usuario", alvo: resolverUsuario(msg, mm[1]) }) },
    ],
  },
  {
    comando: "gostos",
    padroes: [
      { re: /^registra\s+que\s+(.+)\s+gosta\s+de\s+(.+)$/i, montar: (mm, msg) => ({ usuario: resolverUsuario(msg, mm[1]), texto: mm[2].trim() }) },
    ],
  },
  {
    comando: "personalidade",
    padroes: [
      { re: /^registra\s+personalidade\s+de\s+(.+):\s*(.*)$/i, montar: (mm, msg) => ({ usuario: resolverUsuario(msg, mm[1]), texto: mm[2].trim() }) },
    ],
  },
  {
    comando: "memoria",
    padroes: [
      { re: /^guarda\s+mem[oó]ria\s+de\s+(.+):\s*(.*)$/i, montar: (mm, msg) => ({ usuario: resolverUsuario(msg, mm[1]), texto: mm[2].trim() }) },
      { re: /^registra\s+mem[oó]ria\s+de\s+(.+):\s*(.*)$/i, montar: (mm, msg) => ({ usuario: resolverUsuario(msg, mm[1]), texto: mm[2].trim() }) },
    ],
  },
  {
    comando: "afinidade",
    padroes: [
      { re: /^afinidade\s+de\s+(.+)\s+([-+]?\d+)$/i, montar: (mm, msg) => ({ usuario: resolverUsuario(msg, mm[1]), valor: Number(mm[2]) }) },
    ],
  },
  {
    comando: "apelido",
    padroes: [
      { re: /^apelido\s+de\s+(.+)\s+(.+)$/i, montar: (mm, msg) => ({ usuario: resolverUsuario(msg, mm[1]), apelido: mm[2].trim() }) },
    ],
  },
  {
    comando: "mood",
    padroes: [
      { re: /^mood\s+(.+)$/i, montar: (mm) => ({ tipo: mm[1].trim() }) },
      { re: /^muda\s+teu\s+mood\s+pra\s+(.+)$/i, montar: (mm) => ({ tipo: mm[1].trim() }) },
    ],
  },
  {
    comando: "blacklist",
    padroes: [
      { re: /^coloca\s+(.+)\s+na\s+blacklist$/i, montar: (mm, msg) => ({ usuario: resolverUsuario(msg, mm[1]) }) },
    ],
  },
  {
    comando: "unblacklist",
    padroes: [
      { re: /^tira\s+(.+)\s+da\s+blacklist$/i, montar: (mm, msg) => ({ usuario: resolverUsuario(msg, mm[1]) }) },
    ],
  },
  {
    comando: "limparmemoria",
    padroes: [
      { re: /^limpa\s+mem[oó]ria\s+do\s+(.+)$/i, montar: (mm, msg) => ({ usuario: resolverUsuario(msg, mm[1]) }) },
      { re: /^apaga\s+mem[oó]ria\s+do\s+(.+)$/i, montar: (mm, msg) => ({ usuario: resolverUsuario(msg, mm[1]) }) },
    ],
  },
  {
    comando: "revogar",
    padroes: [
      { re: /^revoga\s+acesso\s+do\s+(.+)$/i, montar: (mm, msg) => ({ usuario: resolverUsuario(msg, mm[1]) }) },
    ],
  },
  {
    comando: "send",
    padroes: [
      { re: /^manda\s+mensagem\s+pra\s+(.+):\s*(.+)$/i, montar: (mm, msg) => ({ usuario: resolverUsuario(msg, mm[1]), mensagem: mm[2].trim() }) },
      { re: /^manda\s+dm\s+pra\s+(.+):\s*(.+)$/i, montar: (mm, msg) => ({ usuario: resolverUsuario(msg, mm[1]), mensagem: mm[2].trim() }) },
      { re: /^envia\s+pra\s+(.+)\s+(.+)$/i, montar: (mm, msg) => ({ usuario: resolverUsuario(msg, mm[1]), mensagem: mm[2].trim() }) },
    ],
  },
  {
    comando: "backup",
    padroes: [
      { re: /^cria\s+backup$/i, montar: () => ({ _sub: "criar" }) },
      { re: /^faz\s+backup\s+do\s+servidor$/i, montar: () => ({ _sub: "criar" }) },
      { re: /^lista\s+backups$/i, montar: () => ({ _sub: "listar" }) },
    ],
  },
  {
    comando: "atualizar_lore",
    padroes: [
      { re: /^atualiza\s+o\s+lore$/i, montar: () => ({}) },
      { re: /^reindexa\s+o\s+lore$/i, montar: () => ({}) },
    ],
  },
  {
    comando: "atualizar_poderes",
    padroes: [
      { re: /^atualiza\s+(?:os\s+poderes|as\s+dobras)$/i, montar: () => ({}) },
    ],
  },
  {
    comando: "avaliar_dobra",
    padroes: [
      { re: /^avalia\s+(?:essa\s+)?(?:a\s+)?dobra\s*[:.\-]?\s*(.+)$/i, montar: (mm) => ({ descricao: mm[1].trim() }) },
      { re: /^avalia\s+(?:esse\s+)?poder\s*[:.\-]?\s*(.+)$/i, montar: (mm) => ({ descricao: mm[1].trim() }) },
    ],
  },
  {
    comando: "mod",
    padroes: [
      { re: /^(?:mute|mut[aá])\s+(.+)\s+por\s+(\d+)\s+min(?:utos?)?$/i, montar: (mm, msg) => ({ _sub: "mute", usuario: resolverUsuario(msg, mm[1]), minutos: Number(mm[2]) }) },
      { re: /^silencia\s+(.+)\s+por\s+(\d+)\s+min(?:utos?)?$/i, montar: (mm, msg) => ({ _sub: "mute", usuario: resolverUsuario(msg, mm[1]), minutos: Number(mm[2]) }) },
      { re: /^kick\s+(.+)$/i, montar: (mm, msg) => ({ _sub: "kick", usuario: resolverUsuario(msg, mm[1]) }) },
      { re: /^expulsa\s+(.+)$/i, montar: (mm, msg) => ({ _sub: "kick", usuario: resolverUsuario(msg, mm[1]) }) },
      { re: /^ban\s+(.+)$/i, montar: (mm, msg) => ({ _sub: "ban", usuario: resolverUsuario(msg, mm[1]) }) },
      { re: /^bane\s+(.+)$/i, montar: (mm, msg) => ({ _sub: "ban", usuario: resolverUsuario(msg, mm[1]) }) },
      { re: /^apaga\s+(\d+)\s+mensagens$/i, montar: (mm) => ({ _sub: "apagar", quantidade: Number(mm[1]) }) },
    ],
  },
  {
    comando: "quirk",
    padroes: [
      { re: /^me\s+fala\s+sobre\s+a\s+quirk\s+(.+)$/i, montar: (mm) => ({ _sub: "informacao", nome: mm[1].trim() }) },
      { re: /^quirk\s+(.+)$/i, montar: (mm) => ({ _sub: "informacao", nome: mm[1].trim() }) },
      { re: /^quirk\s+enviar\s+(.+)\s+para\s+(livres|sorteio)$/i, montar: (mm) => ({ _sub: "enviar", nome: mm[1].trim(), canal: mm[2].toLowerCase() }) },
      { re: /^quirk\s+apagar\s+(.+)$/i, montar: (mm) => ({ _sub: "apagar", nome: mm[1].trim() }) },
      { re: /^quirk\s+sum[aá]rio$/i, montar: () => ({ _sub: "sumario" }) },
    ],
  },
  {
    comando: "entrar",
    padroes: [
      { re: /^entra\s+(?:na|no)\s+(?:call|canal\s+de\s+voz)$/i, montar: () => ({}) },
      { re: /^vem\s+pra\s+call$/i, montar: () => ({}) },
    ],
  },
  {
    comando: "sair",
    padroes: [
      { re: /^sai\s+da\s+call$/i, montar: () => ({}) },
      { re: /^sai\s+do\s+canal\s+de\s+voz$/i, montar: () => ({}) },
    ],
  },
  {
    comando: "conversar",
    padroes: [
      { re: /^(?:conversa\s+continua|inicia\s+conversa)$/i, montar: () => ({ modo: "iniciar" }) },
      { re: /^para\s+a\s+conversa$/i, montar: () => ({ modo: "parar" }) },
    ],
  },
  {
    comando: "convidar",
    padroes: [
      { re: /^convite$/i, montar: () => ({}) },
      { re: /^link\s+do\s+convite$/i, montar: () => ({}) },
      { re: /^como\s+te\s+adiciono$/i, montar: () => ({}) },
    ],
  },
];

function buscarRota(texto) {
  const limpo = limparDisparador(texto);
  if (!limpo) return null;
  for (const rota of ROTAS) {
    for (const p of rota.padroes) {
      const mm = limpo.match(p.re);
      if (mm) return { comando: rota.comando, match: mm, padrao: p };
    }
  }
  return null;
}

async function interpretarFalaComando(message) {
  try {
    if (message.author.bot) return false;
    if (!enderecada(message)) return false;
    const hit = buscarRota(message.content || "");
    if (!hit) return false;
    const command = commands.get(hit.comando);
    if (!command) return false;

    const neg = permitidoFala(message, command);
    if (neg) {
      await message.reply(neg).catch(() => {});
      return true;
    }

    const args = hit.padrao.montar ? hit.padrao.montar(hit.match, message) : {};
    const fake = criarInteracaoFake(message, args);
    await command.execute(fake);
    const saidas = (fake.saidas || []).filter(Boolean);
    if (!saidas.length) {
      await message.reply("✅ Feito.").catch(() => {});
      return true;
    }
    for (const s of saidas) await enviarPartes(message, s);
    return true;
  } catch (err) {
    log("ERROR", "[FALA] erro ao executar comando", { erro: err.message });
    await message.reply(`❌ Erro: ${err.message}`).catch(() => {});
    return true;
  }
}

module.exports = { interpretarFalaComando, buscarRota, criarInteracaoFake, ROTAS };