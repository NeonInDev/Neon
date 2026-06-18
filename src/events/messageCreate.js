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
  if (!texto) { await message.reply("❌ erro interno"); return; }

  // Arquivo local (screenshot, etc): __FILE__:C:\path\to\file.png
  const fileMatch = texto.match(/^__FILE__:(.+)/);
  if (fileMatch) {
    try {
      const { AttachmentBuilder } = require("discord.js");
      const filePath = fileMatch[1].trim();
      const nome = `neon_${Date.now()}_${require("path").basename(filePath)}`;
      const attachment = new AttachmentBuilder(filePath, { name: nome });
      await message.reply({ files: [attachment] });
    } catch {
      await message.reply("❌ Erro ao enviar arquivo.");
    }
    return;
  }

  // URLs de imagem — baixa e envia como attachment
  const urlMatch = texto.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) {
    const url = urlMatch[0];
    const isImageExt = /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(url);
    const isImageApi = /(?:picsum|thecatapi|dog\.ceo|pollinations|qrserver\.com\/create-qr-code|placehold\.co)/i.test(url);
    if (isImageExt || isImageApi) {
      try {
        const resp = await axios.get(url, {
          responseType: "arraybuffer",
          timeout: 30000,
          maxContentLength: 10 * 1024 * 1024,
        });
        const ct = resp.headers["content-type"] || "";
        if (ct.startsWith("image/")) {
          const { AttachmentBuilder } = require("discord.js");
          const ext = ct.split("/")[1] || "png";
          const attachment = new AttachmentBuilder(Buffer.from(resp.data), { name: `neon_${Date.now()}.${ext}` });
          const txt = texto.replace(url, "").trim();
          await message.reply({ content: txt || undefined, files: [attachment] });
          return;
        }
      } catch {}
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
      if (!ativar) {
        const slashMatch = lowerContent.match(/^\/neon\s+(.*)/);
        if (slashMatch) {
          ativar = true;
          userInput = slashMatch[1] || "";
        }
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
      const resultadoAcao = await executarAcao(userInput, mestre, message.author.id, message);
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
