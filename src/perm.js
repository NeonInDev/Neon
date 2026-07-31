const OWNER = "1442928336329379925";
const ALLOWED_USERS = [
  OWNER,
  "820967650812362772",
  "1200205111390130190",
];

function isOwner(userId) {
  return userId === OWNER;
}

function permitido(userId) {
  return ALLOWED_USERS.includes(userId);
}

function bloquear(message) {
  if (!permitido(message.author.id)) {
    if (message.channel.type === 1) {
      message.author.send("❌ Acesso negado. Você não tem permissão para usar a Neon.").catch(() => {});
    }
    return true;
  }
  return false;
}

module.exports = { isOwner, permitido, bloquear, ALLOWED_USERS, OWNER };
