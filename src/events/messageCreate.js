const { ChannelType } = require("discord.js");
const { db } = require("../db");
const { askNeon } = require("../ai");
const { executarAcao } = require("../actions");
const { getOrCreateUser } = require("../user");
const { estaNaBlacklist } = require("../moderation");
const { MASTER_KEY } = require("../config");
const { log } = require("../logger");
const axios = require("axios");

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

async function enviarResposta(message, texto) {
  // Detecta URLs de imagem no texto e baixa pra enviar como attachment
  const urlMatch = texto?.match(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp)[^\s]*)|(https?:\/\/image\.pollinations\.ai\/prompt[^\s]*)/i);
  if (urlMatch) {
    try {
      const resp = await axios.get(urlMatch[1] || urlMatch[2], {
        responseType: "arraybuffer",
        timeout: 30000,
        maxContentLength: 10 * 1024 * 1024,
      });
      const { AttachmentBuilder } = require("discord.js");
      const ext = resp.headers["content-type"]?.split("/")[1] || "png";
      const attachment = new AttachmentBuilder(Buffer.from(resp.data), { name: `neon_${Date.now()}.${ext}` });
      const txt = texto.replace(urlMatch[0], "").trim();
      await message.reply({ content: txt || undefined, files: [attachment] });
      return;
    } catch {
      // Fallback: envia URL pura (Discord pode embedar automaticamente)
      await message.reply(texto);
      return;
    }
  }
  await message.reply(texto);
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

      const lowerContent = content.toLowerCase();
      const neonMatch = lowerContent.match(/^neon[,\s\.]\s*(.*)/);
      if (neonMatch) {
        ativar = true;
        userInput = neonMatch[1] || "";
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

      const mestre = db.data.users?.[message.author.id]?.mestre || false;
      const resultadoAcao = await executarAcao(userInput, mestre, message.author.id);
      if (resultadoAcao) {
        await enviarResposta(message, resultadoAcao);
        return;
      }

      await message.channel.sendTyping();
      const imageUrl = message.attachments.first()?.url || null;
      const reply = await askNeon(message.author.id, message.author.username, userInput, imageUrl);
      if (!message.replied) {
        await enviarResposta(message, reply);
      }
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
