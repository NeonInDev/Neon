const { ChannelType } = require("discord.js");
const { db } = require("../db");
const { askNeon } = require("../ai");
const { executarAcao } = require("../actions");
const { getOrCreateUser } = require("../user");
const { estaNaBlacklist } = require("../moderation");
const { MASTER_KEY } = require("../config");
const { log } = require("../logger");
const { verificarRateLimit, permitido, auditar } = require("../permissions");
const { enfileirar } = require("../fila");
const { add: addContexto } = require("../contexto");
const axios = require("axios");

const processando = new Set();
const cooldowns = new Map();
const COOLDOWN_MS = 3000;
const DEBOUNCE_MS = 1500;
const mensagensPendentes = new Map();

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

  const fileMatch = texto.match(/__FILE__:(.+)/);
  if (fileMatch) {
    try {
      const { AttachmentBuilder } = require("discord.js");
      const filePath = fileMatch[1].split("\n")[0].trim();
      const nome = `neon_${Date.now()}_${require("path").basename(filePath)}`;
      const attachment = new AttachmentBuilder(filePath, { name: nome });
      const txt = texto.replace(fileMatch[0], "").trim();
      await message.reply({ content: txt || undefined, files: [attachment] });
    } catch {
      await message.reply("❌ Erro ao enviar arquivo.");
    }
    return;
  }

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

function combinarTextoMensagens(mensagens) {
  const textos = mensagens
    .map(m => m.content.trim())
    .filter(t => t.length > 0);
  if (textos.length === 0) return "";
  return textos.join(" ");
}

function algumaAtiva(mensagens, message) {
  for (const m of mensagens) {
    const lower = m.content.toLowerCase();
    if (/^\/neon\b/.test(lower)) return true;
  }
  if (message.reference) return true;
  if (message.channel.type === ChannelType.DM) return true;
  return false;
}

async function processarLote(userId, lote) {
  mensagensPendentes.delete(userId);
  const message = lote.ultimoObjeto;

  const combinedInput = combinarTextoMensagens(lote.mensagens);
  if (!combinedInput) return;
  if (!algumaAtiva(lote.mensagens, message)) return;
  if (checkCooldown(userId)) return;

  enfileirar(userId, async () => {
    processando.delete(message.id);
    try {
      const mestre = db.data.users?.[userId]?.mestre || false;
      const username = message.author.username;

      await message.channel.sendTyping();
      const resultadoAcao = await executarAcao(combinedInput, mestre, userId, message);
      if (resultadoAcao && !resultadoAcao.startsWith("❌")) {
        addContexto(userId, username, combinedInput, resultadoAcao);
        auditar(userId, username, combinedInput, resultadoAcao.slice(0, 100));
        await enviarResposta(message, resultadoAcao);
        return;
      }

      const imageUrl = message.attachments.first()?.url || null;
      const reply = await askNeon(userId, username, combinedInput, imageUrl);
      if (!message.replied) {
        addContexto(userId, username, combinedInput, reply);
        auditar(userId, username, combinedInput, reply?.slice(0, 100));
        await enviarResposta(message, reply);
      }
    } catch (err) {
      log("ERROR", "Erro ao processar lote", { usuario: message.author.username, erro: err.message });
      try {
        await message.reply("❌ erro interno");
      } catch {}
    } finally {
      processando.delete(message.id);
    }
  });
}

module.exports = {
  name: "messageCreate",
  async execute(message) {
    if (message.author.bot) return;
    if (estaNaBlacklist(db, message.author.id)) return;
    if (await verificarChaveMestra(message)) return;
    if (processando.has(message.id)) return;
    processando.add(message.id);

    const rl = verificarRateLimit(message.author.id);
    if (!rl.permitido) {
      processando.delete(message.id);
      const seg = Math.ceil(rl.tempoRestante / 1000);
      if (seg > 0) {
        try { await message.reply(`⏳ Calma la! Aguarde ${seg}s entre os comandos.`); } catch {}
      }
      return;
    }

    // Audio (voice message) — processa imediatamente, sem debounce
    const { processarAudioMessage } = require("../discord_audio");
    if (await processarAudioMessage(message)) {
      processando.delete(message.id);
      return;
    }

    // Debounce: agrupa mensagens do mesmo usuário enviadas em sequência
    const pendente = mensagensPendentes.get(message.author.id);
    if (pendente) {
      clearTimeout(pendente.timer);
      pendente.mensagens.push(message);
      pendente.ultimoObjeto = message;
      pendente.timer = setTimeout(() => processarLote(message.author.id, pendente), DEBOUNCE_MS);
      return;
    }

    const lote = { mensagens: [message], ultimoObjeto: message, timer: null };
    lote.timer = setTimeout(() => processarLote(message.author.id, lote), DEBOUNCE_MS);
    mensagensPendentes.set(message.author.id, lote);
  },
};
