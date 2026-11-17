// =============================================================
// REGRAS DE MODERACAO — um lugar so
// -------------------------------------------------------------
// Quem executa e sempre a NEON: a permissao e o cargo sao DELA, nao
// de quem digitou o comando. Por isso o dono age sem cargo de staff —
// e por isso o cargo da Neon precisa estar acima do alvo.
//
// Hierarquia do Discord nao se fura por codigo: se o alvo tem cargo
// igual/acima do da Neon, a unica saida e subir o cargo do bot.
// =============================================================
const { PermissionFlagsBits } = require("discord.js");

const MAX_TIMEOUT_MIN = 40320; // 28 dias, teto do Discord

const RX_ID = /^\d{17,20}$/;

const PERM_ACAO = {
  silenciar: PermissionFlagsBits.ModerateMembers,
  desmutar: PermissionFlagsBits.ModerateMembers,
  expulsar: PermissionFlagsBits.KickMembers,
  banir: PermissionFlagsBits.BanMembers,
  adicionar_cargo: PermissionFlagsBits.ManageRoles,
  remover_cargo: PermissionFlagsBits.ManageRoles,
};

const NOME_PERM = {
  [PermissionFlagsBits.ModerateMembers]: "Silenciar Membros",
  [PermissionFlagsBits.KickMembers]: "Expulsar Membros",
  [PermissionFlagsBits.BanMembers]: "Banir Membros",
  [PermissionFlagsBits.ManageRoles]: "Gerenciar Cargos",
};

// o que o discord.js exige do alvo, por acao
const PODE = {
  silenciar: (m) => m.moderatable,
  desmutar: (m) => m.moderatable,
  expulsar: (m) => m.kickable,
  banir: (m) => m.bannable,
};

// "5", "5m", "30 min", "2h", "7d" -> minutos (null se nao der pra ler)
function minutosDe(texto) {
  const m = String(texto ?? "")
    .trim()
    .toLowerCase()
    .match(/^(\d{1,5})\s*(m|min|mins|minuto|minutos|h|hora|horas|d|dia|dias)?$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unidade = m[2] || "m";
  const fator = unidade.startsWith("d") ? 1440 : unidade.startsWith("h") ? 60 : 1;
  const total = n * fator;
  if (!Number.isFinite(total) || total < 1 || total > MAX_TIMEOUT_MIN) return null;
  return total;
}

// null = pode agir; string = motivo da recusa
function motivoRecusa(guild, autorId, membro, acao) {
  if (membro.id === guild.client.user.id) return "eu não vou moderar a mim mesmo.";
  if (membro.id === autorId) return "você não vai moderar a si mesmo, né?";
  if (membro.id === guild.ownerId) return "o dono do servidor não pode levar essa ação.";
  const eu = guild.members.me;
  const precisa = PERM_ACAO[acao];
  if (precisa && !eu?.permissions?.has(precisa)) {
    return `eu não tenho **${NOME_PERM[precisa]}** aqui. Me dá essa permissão e põe o meu cargo acima do dele.`;
  }
  const posso = PODE[acao];
  if (posso && !posso(membro)) {
    return `não consigo agir em **${membro.user.tag}**: o cargo dele é igual ou maior que o meu. Sobe o cargo da Neon na hierarquia.`;
  }
  return null;
}

// cargo: alem de Gerenciar Cargos, o cargo da Neon tem que estar ACIMA
// do cargo que vai ser dado/tirado — e acima do cargo mais alto do alvo.
function motivoRecusaCargo(guild, membro, cargo) {
  if (cargo.id === guild.id) return "o @everyone não é um cargo de verdade.";
  if (cargo.managed) {
    return `o cargo **${cargo.name}** é gerenciado por integração (bot/booster) e não pode ser dado na mão.`;
  }
  const eu = guild.members.me;
  if (!eu?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    return "eu não tenho **Gerenciar Cargos**.";
  }
  if (eu.roles.highest.comparePositionTo(cargo) <= 0) {
    return `o cargo **${cargo.name}** está acima (ou no mesmo nível) do meu. Sobe o cargo da Neon.`;
  }
  if (!membro.manageable) {
    return `não consigo mexer nos cargos de **${membro.user.tag}** — o cargo mais alto dele é igual/acima do meu.`;
  }
  return null;
}

// avisa quando o cargo carrega poder de verdade, pra nao dar Admin sem ver
function cargoPerigoso(cargo) {
  const P = PermissionFlagsBits;
  return (
    cargo.permissions.has(P.Administrator) ||
    cargo.permissions.has(P.ManageGuild) ||
    cargo.permissions.has(P.ManageRoles) ||
    cargo.permissions.has(P.BanMembers)
  );
}

module.exports = {
  MAX_TIMEOUT_MIN,
  RX_ID,
  PERM_ACAO,
  NOME_PERM,
  minutosDe,
  motivoRecusa,
  motivoRecusaCargo,
  cargoPerigoso,
};
