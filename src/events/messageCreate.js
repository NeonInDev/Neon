const { ChannelType } = require("discord.js");
const { db } = require("../db");
const { askNeon } = require("../ai");
const { getOrCreateUser } = require("../user");
const { estaNaBlacklist } = require("../moderation");
const { MASTER_KEY } = require("../config");
const { log } = require("../logger");

const processando = new Set();
const cooldowns = new Map();
const COOLDOWN_MS = 3000;

async function verificarChaveMestra(message) {
  if (message.content.trim() !== MASTER_KEY) return false;
  if (message.channel.type !== ChannelType.DM) {
    log("WARN", "Chave mestra rejeitada — só funciona em DM");
    return false;
  }
  getOrCreateUser(db, message.author.id, message.author.username);
  db.data.users[message.author.id].mestre = true;
  await db.write();
  log("INFO", "Chave mestra validada", { usuario: message.author.username, id: message.author.id });
  try {
    await message.author.send("🔐 acesso mestre concedido.");
  } catch {
    log("WARN", "Falha ao enviar DM da chave mestra", { usuario: message.author.username });
  }
  return true;
}

function checkCooldown(userId) {
  const agora = Date.now();
  const ultimo = cooldowns.get(userId);
  if (ultimo && agora - ultimo < COOLDOWN_MS) return true;
  cooldowns.set(userId, agora);
  return false;
}

module.exports = {
  name: "messageCreate",
  async execute(message) {
    if (message.author.bot) return;
    if (estaNaBlacklist(db, message.author.id)) return;
    if (await verificarChaveMestra(message)) return;
    if (processando.has(message.id)) return;
    processando.add(message.id);

    try {
      const content = message.content;
      let ativar = false;
      let userInput = content;

      if (content.toLowerCase().startsWith("neon,")) {
        ativar = true;
        userInput = content.slice(5).trim();
      }

      if (message.reference && !ativar) {
        try {
          const replied = await message.channel.messages.fetch(message.reference.messageId);
          if (replied.author.id === message.client.user.id) ativar = true;
        } catch {
          log("WARN", "Falha ao buscar mensagem respondida");
        }
      }

      if (message.channel.type === ChannelType.DM && !ativar) {
        if (content.trim().length >= 2) ativar = true;
      }

      if (!ativar) return;
      if (checkCooldown(message.author.id)) return;

      await message.channel.sendTyping();
      const imageUrl = message.attachments.first()?.url || null;
      const reply = await askNeon(message.author.id, message.author.username, userInput, imageUrl);
      if (!message.replied) await message.reply(reply);
    } catch (err) {
      log("ERROR", "Erro ao processar mensagem", { usuario: message.author.username, erro: err.message });
      try {
        await message.reply("❌ erro interno");
      } catch {}
    } finally {
      processando.delete(message.id);
    }
  },
};
