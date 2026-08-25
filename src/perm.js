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
    return Array.isArray(lista) ? lista.filter((id) => typeof id === "string") : [];
  } catch { return []; }
}

function salvarGuests(lista) {
  fs.mkdirSync(path.dirname(GUESTS_FILE), { recursive: true });
  fs.writeFileSync(GUESTS_FILE, JSON.stringify([...new Set(lista)].filter((id) => id !== OWNER), null, 2), "utf8");
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

module.exports = { isOwner, isGuest, guests, salvarGuests, permitido, bloquear, ALLOWED_USERS, OWNER };
