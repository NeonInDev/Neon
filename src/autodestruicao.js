const { log } = require("./logger");

const processando = new Set();

async function apagarMensagensBot(guild) {
  const botId = guild.client.user.id;
  let apagadas = 0;

  try {
    await guild.channels.fetch().catch(() => {});
  } catch {}

  for (const ch of guild.channels.cache.values()) {
    if (!ch.isTextBased()) continue;

    const permissoes = ch.permissionsFor(guild.client.user);
    if (permissoes && (!permissoes.has("ReadMessageHistory") || !permissoes.has("ManageMessages"))) continue;

    let antes = undefined;
    for (let i = 0; i < 200; i++) {
      let msgs;
      try {
        msgs = await ch.messages.fetch({ limit: 100, before: antes, cache: false });
      } catch {
        break;
      }
      if (!msgs || !msgs.size) break;

      const botMsgs = msgs.filter((m) => m.author && m.author.id === botId && m.deletable);
      if (botMsgs.size) {
        let ok = null;
        try {
          ok = await ch.bulkDelete(botMsgs, true).catch(() => null);
        } catch {}
        apagadas += ok && ok.size ? ok.size : 0;
        for (const m of botMsgs.values()) {
          if (ok && ok.has(m.id)) continue;
          try {
            await m.delete();
            apagadas++;
          } catch {}
        }
      }

      antes = msgs.last().id;
    }
  }

  return apagadas;
}

async function destruir(guild) {
  if (!guild || !guild.client?.user || processando.has(guild.id)) return;
  processando.add(guild.id);
  try {
    log("WARN", "[AUTODESTRUIÇÃO] Dono saiu ou foi banido, iniciando", { guild: guild.name, id: guild.id });
    const apagadas = await apagarMensagensBot(guild).catch((err) => {
      log("ERROR", "[AUTODESTRUIÇÃO] Falha ao apagar mensagens", { erro: err.message });
      return 0;
    });
    log("WARN", "[AUTODESTRUIÇÃO] Mensagens apagadas", { guild: guild.name, apagadas });
    try {
      await guild.leave();
    } catch (err) {
      log("ERROR", "[AUTODESTRUIÇÃO] Falha ao sair", { guild: guild.name, erro: err.message });
    }
  } finally {
    processando.delete(guild.id);
  }
}

module.exports = { destruir };