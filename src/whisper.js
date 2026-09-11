// src/whisper.js — Modo whisper da Neon.
// Quando ativo em um servidor, TODA mensagem do dono é copiada e reenviada pela
// Neon no MESMO chat. Variante "del": apaga a mensagem original do dono.
// Comandos (só dono): "neon whisper" (liga), "neon whisper del" (liga + apaga a
// original), "neon whisper off" / "neon whisper desliga" (desliga), "neon whisper status".

const { log } = require("./logger");
const { isOwner } = require("./perm");

const COMANDO = /^\s*(?:neon|<@!?\d+>)[\s,!.\-:;]+whisper\b/i;

function lerEstado(db, guildId) {
  if (!db?.data?.whisper) return null;
  return db.data.whisper[guildId] || null;
}

function escreverEstado(db, guildId, estado) {
  if (!db?.data) return;
  if (!db.data.whisper) db.data.whisper = {};
  if (estado) db.data.whisper[guildId] = estado;
  else delete db.data.whisper[guildId];
  db.write().catch((err) => log("WARN", "[WHISPER] Falha ao salvar estado", { erro: err.message }));
}

function estaAtivo(db, guildId) {
  const e = lerEstado(db, guildId);
  return !!e;
}

function ehDel(db, guildId) {
  const e = lerEstado(db, guildId);
  return !!(e && e.del);
}

// Interpreta comandos de whisper (liga/desliga/status). Retorna true se era comando.
function interpretarComando(message) {
  if (!isOwner(message.author.id)) return false;
  if (!message.guild) return false;
  const texto = message.content || "";
  if (!COMANDO.test(texto)) return false;

  const db = require("./db").db;
  const del = /\bdel\b|\bdelete\b|\bdeletar\b|\bapaga\b/i.test(texto);
  const desliga = /\b(off|desliga|desligar|para|parar)\b/i.test(texto);

  if (desliga) {
    escreverEstado(db, message.guild.id, null);
    log("INFO", "[WHISPER] Desativado", { guild: message.guild.name });
    message.reply("🤫 Whisper desativado. Suas mensagens voltam a aparecer como suas.").catch(() => {});
    return true;
  }

  const ehStatus = /\b(status|como está|como esta|como ta|ativa)\b/i.test(texto) && !del;
  if (ehStatus) {
    const e = lerEstado(db, message.guild.id);
    message.reply(e
      ? (e.del
        ? "🤫 Whisper **del** está ativo aqui — suas mensagens são copiadas e a original é apagada."
        : "🤫 Whisper está **ativo** aqui — suas mensagens são copiadas por mim no mesmo chat.")
      : "🙃 Whisper está **desativado** neste servidor.").catch(() => {});
    return true;
  }

  escreverEstado(db, message.guild.id, { del });
  log("INFO", "[WHISPER] Ativado", { guild: message.guild.name, del });
  message.reply(del
    ? "🤫 Whisper **del** ligado! Suas mensagens agora são reenviadas por mim e a original é apagada."
    : "🤫 Whisper ligado! Suas mensagens agora são reenviadas por mim no mesmo chat.").catch(() => {});
  return true;
}

// Se o whisper está ativo e a mensagem é do dono, reenvia no mesmo chat.
// Retorna true se a mensagem foi "consumida" (não deve ser processada pela Neon).
async function consumirMensagem(message) {
  if (message.author.bot) return false;
  if (!isOwner(message.author.id)) return false;
  if (!message.guild) return false;

  const db = require("./db").db;
  if (!estaAtivo(db, message.guild.id)) return false;

  // Nunca engolir o próprio comando de desligar/serial
  if (interpretarComando(message)) return true;

  const del = ehDel(db, message.guild.id);
  const conteudo = String(message.content || "").trim();
  const anexos = [...(message.attachments?.values?.() || [])];

  if (conteudo || anexos.length) {
    try {
      const opts = { content: conteudo || null };
      if (anexos.length) opts.files = anexos.map((a) => a.url);
      await message.channel.send(opts);
      log("INFO", "[WHISPER] Mensagem do dono reenviada", { guild: message.guild.name, canal: message.channel.name, del });
    } catch (err) {
      log("WARN", "[WHISPER] Falha ao reenviar", { erro: err.message });
    }
  }

  if (del) {
    try {
      await message.delete();
      log("INFO", "[WHISPER] Original apagada (del)", { guild: message.guild.name });
    } catch (err) {
      log("WARN", "[WHISPER] Falha ao apagar original", { erro: err.message });
    }
  }

  return true;
}

module.exports = { interpretarComando, consumirMensagem, estaAtivo, ehDel };