const fs = require("fs");
const path = require("path");
const OWNER = "1442928336329379925";
const ALLOWED_USERS = [
  OWNER,
  "820967650812362772",
  "1200205111390130190",
];
const GUESTS_FILE = path.join(__dirname, "..", "data", "guests.json");

function guests() {
  try {
    if (!fs.existsSync(GUESTS_FILE)) return [];
    const lista = JSON.parse(fs.readFileSync(GUESTS_FILE, "utf8"));
    if (!Array.isArray(lista)) return [];
    const agora = Date.now();
    return lista
      .map((item) => typeof item === "string" ? { id: item, expiresAt: null } : item)
      .filter((item) => item && typeof item.id === "string" && (!item.expiresAt || item.expiresAt > agora))
      .map((item) => item.id);
  } catch { return []; }
}

function salvarGuests(lista) {
  fs.mkdirSync(path.dirname(GUESTS_FILE), { recursive: true });
  fs.writeFileSync(GUESTS_FILE, JSON.stringify([...new Set(lista)].filter((id) => id !== OWNER).map((id) => ({ id, expiresAt: null })), null, 2), "utf8");
}

function adicionarGuest(userId, duracaoMs = null) {
  const ids = guests().filter((id) => id !== userId);
  fs.mkdirSync(path.dirname(GUESTS_FILE), { recursive: true });
  const registros = ids.map((id) => ({ id, expiresAt: null }));
  registros.push({ id: userId, expiresAt: duracaoMs ? Date.now() + duracaoMs : null });
  fs.writeFileSync(GUESTS_FILE, JSON.stringify(registros, null, 2), "utf8");
}

function removerGuest(userId) {
  salvarGuests(guests().filter((id) => id !== userId));
}

function isGuest(userId) {
  return guests().includes(userId);
}

function isOwner(userId) {
  return userId === OWNER;
}

function permitido(userId) {
  return ALLOWED_USERS.includes(userId) || isGuest(userId);
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

module.exports = { isOwner, isGuest, guests, salvarGuests, adicionarGuest, removerGuest, permitido, bloquear, ALLOWED_USERS, OWNER };
