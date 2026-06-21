const { db, initDB } = require("../db");
const { log } = require("../logger");
const { startDocsServer, getUrl } = require("../docs/server");
const pc = require("../pc");
const bridge = require("../bridge");

const MASTER_ID = "1442928336329379925";

module.exports = {
  name: "ready",
  once: true,
  async execute(c) {
    await initDB();

    try {
      const scheduler = require("../scheduler");
      scheduler.iniciar(c);
    } catch (err) {
      log("WARN", "Scheduler não iniciou", { erro: err.message });
    }

    try {
      bridge.iniciarPolling(c);
    } catch (err) {
      log("WARN", "Bridge polling não iniciou", { erro: err.message });
    }

    try {
      const port = await startDocsServer();
      log("INFO", `Documentação disponível em ${getUrl(port)}`);
    } catch (err) {
      log("WARN", "Servidor de documentação não iniciou", { erro: err.message });
    }

    try {
      pc.tts("Neon iniciando de novo").catch(() => {});
      await pc.notificarToast("Neon", "Neon iniciando de novo!");
    } catch {
      log("WARN", "Notificação Windows falhou");
    }

    try {
      const master = await c.users.fetch(MASTER_ID);
      if (master) await master.send("🔁 Neon iniciando novamente!");
    } catch {
      log("WARN", "DM ao mestre falhou");
    }

    log("INFO", "Client conectado", {
      tag: c.user.tag,
      guilds: c.guilds.cache.size,
    });
  },
};
