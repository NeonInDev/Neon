const { ChannelType } = require("discord.js");
const { db } = require("../db");
const { askNeon } = require("../ai");
const { getOrCreateUser } = require("../user");
const { estaNaBlacklist } = require("../moderation");
const { MASTER_KEY } = require("../config");
const { log } = require("../logger");
const { verificarRateLimit, auditar } = require("../permissions");
const { isOwner } = require("../perm");
const { adicionarGuest, removerGuest, guestRecords } = require("../perm");
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

function interpretarConvidado(message) {
  if (!isOwner(message.author.id)) return false;
  const texto = message.content || "";
  const prefixo = /^\s*(?:neon|<@!?\d+>)[\s,!.\-:;]+/i;
  if (!prefixo.test(texto)) return false;
  if (/\b(list[ae]|listar|mostra|mostrar)\b.*\b(convidados?|casa)\b/i.test(texto)) {
    const lista = guestRecords();
    const resumo = lista.length
      ? lista.map((item) => {
        const inicio = item.addedAt ? `<t:${Math.floor(item.addedAt / 1000)}:F>` : "data não registrada";
        const fim = item.expiresAt ? `<t:${Math.floor(item.expiresAt / 1000)}:R>` : "nunca";
        return `• <@${item.id}> — adicionado: ${inicio} — expira: ${fim}`;
      }).join("\n")
      : "Nenhum convidado cadastrado.";
    message.reply(`👥 **Convidados**\n${resumo}`).catch(() => {});
    return true;
  }
  const mencionado = message.mentions?.users?.find((usuario) => usuario.id !== message.client.user?.id);
  const id = mencionado?.id || texto.match(/<@!?(\d+)>/)?.[1];
  if (!id) return false;
  const remover = /\b(tire|remova|remover|retire|remove|remover)\b/i.test(texto);
  const adicionar = /\b(coloque|adicion[ae]|adicionar|convid[ae]|convidar)\b/i.test(texto);
  if (!remover && !adicionar) return false;
  if (remover) {
    removerGuest(id);
    message.reply(`✅ <@${id}> foi removido da casa.`).catch(() => {});
    return true;
  }
  const duracao = texto.match(/\bpor\s+(\d+(?:[.,]\d+)?)\s*(minutos?|mins?|horas?|dias?|d)\b/i);
  let duracaoMs = null;
  let resumo = "permanentemente";
  if (duracao) {
    const valor = Number(duracao[1].replace(",", "."));
    const unidade = duracao[2].toLowerCase();
    const multiplicador = /^min/.test(unidade) ? 60000 : /^hor/.test(unidade) ? 3600000 : 86400000;
    duracaoMs = Math.round(valor * multiplicador);
    resumo = `por ${duracao[1]} ${unidade}`;
  }
  adicionarGuest(id, duracaoMs);
  message.reply(`✅ <@${id}> agora é convidado ${resumo}, podendo apenas conversar com a Neon.`).catch(() => {});
  return true;
}

async function enviarResposta(message, texto) {
  if (!texto) { await message.reply("❌ erro interno"); return; }

  // Suporte a respostas continuadas (__CONTINUA__ no início = mensagem adicional)
  if (texto.startsWith("__CONTINUA__")) {
    const conteudo = texto.replace("__CONTINUA__", "").trim();
    if (conteudo) await message.channel.send(conteudo);
    return;
  }

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
  const MAX = 2000;
  if (texto.length > MAX) {
    const partes = [];
    let restante = texto;
    while (restante.length > MAX) {
      let corte = restante.lastIndexOf("\n", MAX);
      if (corte <= 0) corte = MAX;
      partes.push(restante.slice(0, corte));
      restante = restante.slice(corte);
    }
    partes.push(restante);
    await message.reply(partes[0]);
    for (let i = 1; i < partes.length; i++) {
      await message.channel.send(partes[i]);
    }
    return;
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
  const bot = message.client.user;
  // 1) @mention real da Neon (ex.: "@Neon faz X")
  if (message.mentions?.has(bot?.id)) return true;
  for (const m of mensagens) {
    const lower = m.content.toLowerCase();
    // 2) Prefixo neon (convidados também podem conversar por este caminho)
    if (/^\/neon\b/.test(lower)) return true;
    // 3) Fala "neon" no início ou no final (menção por nome)
    if (/^\s*neon[\s,!.\-:;]*\s*/i.test(lower) || /[\s,!.\-:;]*\s*neon\s*$/i.test(lower)) return true;
  }
  // 4) Reply SOMENTE se for na mensagem da própria Neon (não em qualquer reply)
  if (message.reference?.messageId) {
    try {
      const referenciada = message.channel?.messages?.cache?.get(message.reference.messageId);
      if (referenciada?.author?.id === bot?.id) return true;
    } catch {}
  }
  // 5) DM
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

  // Remove "neon" do início/fim pra não poluir o contexto
  const textoLimpo = combinedInput
    .replace(/^\s*neon[\s,!.\-:;]+\s*/i, "")
    .replace(/[\s,!.\-:;]*\s*neon\s*$/i, "")
    .trim() || combinedInput;

  enfileirar(userId, async () => {
    processando.delete(message.id);
    try {
      const username = message.author.username;

      await message.channel.sendTyping();
      const imageUrl = message.attachments.first()?.url || null;
      const avisarAtraso = isOwner(userId)
        ? () => message.author.send("⚠️ O OpenCode está processando há mais de 3 minutos. A Neon continuará aguardando até 5 minutos antes de informar o erro.")
        : null;
      const reply = await askNeon(userId, username, textoLimpo, imageUrl, false, avisarAtraso);
      if (!message.replied) {
        addContexto(userId, username, textoLimpo, reply);
        auditar(userId, username, textoLimpo, reply?.slice(0, 100));
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
    const { bloquear } = require("../perm");
    if (bloquear(message)) return;
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
    if (interpretarConvidado(message)) {
      processando.delete(message.id);
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
