// src/pings.js — Avisa o dono (em voz/DM) quando alguém o menciona em servidores.
const { log } = require("./logger");
const { OWNER } = require("./perm");

const ATIVO = process.env.PINGS === "1";
const COOLDOWN_MS = 180000; // não repete aviso pro mesmo ping por 3 min
const ultimos = new Map();

function estaAtivo() {
  return ATIVO;
}

// Retorna true se a mensagem "menciona de verdade" o dono (mention, reply ou nome).
function mencionaDono(message) {
  const dono = `<@${OWNER}>`;
  const donoB = `<@!${OWNER}>`;
  const texto = String(message.content || "");
  if (texto.includes(dono) || texto.includes(donoB)) return true;
  if (message.mentions?.has(OWNER)) return true;
  if (message.reference?.messageId) {
    try {
      const ref = message.channel?.messages?.cache?.get(message.reference.messageId);
      if (ref?.author?.id === OWNER) return true;
    } catch {}
  }
  return false;
}

async function falarEmVoz(guildId, texto) {
  try {
    const voz = require("./voz");
    return await voz.falar(guildId, texto);
  } catch {
    return false;
  }
}

async function avisar(message) {
  if (!ATIVO) return;
  if (!message.guild) return;
  if (!mencionaDono(message)) return;
  if (message.author.id === OWNER) return;

  const canal = message.channel;
  const guildId = message.guild.id;
  const chave = `${message.author.id}:${guildId}`;
  const agora = Date.now();
  const ultimo = ultimos.get(chave);
  if (ultimo && agora - ultimo < COOLDOWN_MS) return;
  ultimos.set(chave, agora);

  const autor = message.author?.username || "Alguém";
  const texto = String(message.content || "").replace(/<@!?\d+>/g, "").trim().slice(0, 120) || "[sem texto]";
  const canalNome = canal?.name ? `#${canal.name}` : "DM/voz";
  const resumo = `Te marcaram no ${message.guild.name}: ${autor} disse ${texto} no canal ${canalNome}.`;

  log("INFO", "[PINGS] Ping ao dono detectado", { autor: message.author.tag, guild: message.guild.name, canal: canalNome });

  // 1) Se a Neon está em um canal de voz do servidor, fala lá.
  const falou = await falarEmVoz(guildId, resumo);

  // 2) Sempre manda DM pro dono (para o caso de ele não estar na sala / sem fone).
  let dm = { ok: false };
  try {
    const { client } = require("./client");
    if (client?.isReady()) {
      const user = await client.users.fetch(OWNER);
      await user.send(`🔔 ${resumo}\n📎 [Ver mensagem](https://discord.com/channels/${guildId}/${canal?.id || ""}/${message.id})`);
      dm.ok = true;
    }
  } catch {}

  if (!falou && !dm.ok) {
    log("WARN", "[PINGS] Não conseguiu avisar (sem voz e sem DM)", { autor: message.author.tag });
  }
}

module.exports = { avisar, estaAtivo, mencionaDono };