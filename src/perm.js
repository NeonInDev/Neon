const fs = require("fs");
const path = require("path");
const OWNER = "1454628188717191209";
const ALLOWED_USERS = [
  OWNER,
  "820967650812362772",
  "1200205111390130190",
  // 1221320772224553071 removido por pedido do dono: perdeu o acesso total
  // a Neon (permitido() = ALLOWED_USERS ou guest, e guests.json esta vazio).
];
const GUESTS_FILE = path.join(__dirname, "..", "data", "guests.json");

function guests() {
  return guestRecords().map((item) => item.id);
}

function guestRecords() {
  try {
    if (!fs.existsSync(GUESTS_FILE)) return [];
    const lista = JSON.parse(fs.readFileSync(GUESTS_FILE, "utf8"));
    if (!Array.isArray(lista)) return [];
    const agora = Date.now();
    return lista
      .map((item) => typeof item === "string" ? { id: item, expiresAt: null } : item)
      .filter((item) => item && typeof item.id === "string" && (!item.expiresAt || item.expiresAt > agora));
  } catch { return []; }
}

function salvarGuests(lista) {
  fs.mkdirSync(path.dirname(GUESTS_FILE), { recursive: true });
  fs.writeFileSync(GUESTS_FILE, JSON.stringify([...new Set(lista)].filter((id) => id !== OWNER).map((id) => ({ id, expiresAt: null })), null, 2), "utf8");
}

function adicionarGuest(userId, duracaoMs = null) {
  const registrosAtuais = guestRecords().filter((item) => item.id !== userId);
  fs.mkdirSync(path.dirname(GUESTS_FILE), { recursive: true });
  const registros = registrosAtuais.map((item) => ({ ...item }));
  registros.push({ id: userId, addedAt: Date.now(), expiresAt: duracaoMs ? Date.now() + duracaoMs : null });
  fs.writeFileSync(GUESTS_FILE, JSON.stringify(registros, null, 2), "utf8");
}

function removerGuest(userId) {
  fs.mkdirSync(path.dirname(GUESTS_FILE), { recursive: true });
  fs.writeFileSync(GUESTS_FILE, JSON.stringify(guestRecords().filter((item) => item.id !== userId), null, 2), "utf8");
}

function isGuest(userId) {
  return guests().includes(userId);
}

function isOwner(userId) {
  return userId === OWNER;
}

// Donos com poder de MODERAÇÃO no Discord (mute/ban/kick/cargo).
// OWNER continua sendo o dono total da Neon (PC, backup, arquivos): os
// demais IDs entram só aqui, sem herdar esse poder todo. Vem do .env
// (DONO_IDS, separado por vírgula) e cai pra lista fixa se não existir.
const DONOS_MODERACAO = [
  ...new Set([
    OWNER,
    ...String(process.env.DONO_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    "1442928336329379925",
  ]),
];

function isDonoModeracao(userId) {
  return DONOS_MODERACAO.includes(userId);
}

function permitido(userId) {
  return ALLOWED_USERS.includes(userId) || isGuest(userId);
}

function bloquear(message) {
  if (!permitido(message.author.id)) {
    if (message.channel.type === 1) {
      message.author.send("âŒ Acesso negado. VocÃª nÃ£o tem permissÃ£o para usar a Neon.").catch(() => {});
    }
    return true;
  }
  return false;
}

module.exports = { isOwner, isDonoModeracao, DONOS_MODERACAO, isGuest, guests, guestRecords, salvarGuests, adicionarGuest, removerGuest, permitido, bloquear, ALLOWED_USERS, OWNER };
