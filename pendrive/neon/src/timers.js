const { log } = require("./logger");

const lembretes = new Map();
let idCounter = 0;

async function criarLembrete(discordId, channel, delayMs, mensagem) {
  const id = ++idCounter;
  const timeout = setTimeout(async () => {
    try {
      await channel.send(`<@${discordId}> ⏰ **Lembrete:** ${mensagem}`);
    } catch (err) {
      log("ERROR", "Erro ao enviar lembrete", { erro: err.message });
    }
    lembretes.delete(id);
  }, delayMs);
  lembretes.set(id, { timeout, mensagem, restanteMs: delayMs });
  log("INFO", "Lembrete criado", { id, discordId, delayMs, mensagem: mensagem.slice(0, 50) });
  return id;
}

function cancelarLembrete(id) {
  const item = lembretes.get(id);
  if (!item) return false;
  clearTimeout(item.timeout);
  lembretes.delete(id);
  return true;
}

function listarLembretes() {
  return Array.from(lembretes.entries()).map(([id, item]) => ({ id, mensagem: item.mensagem, restanteMs: item.restanteMs }));
}

module.exports = { criarLembrete, cancelarLembrete, listarLembretes };
