const { db, initDB } = require("../db");
const { log } = require("../logger");
const pc = require("../pc");
const { OWNER } = require("../perm");

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
      const tools = require("../tools");
      tools.iniciar();
    } catch (err) {
      log("WARN", "Tools nao iniciaram", { erro: err.message });
    }

    try {
      pc.notificarToast("Neon", "Neon iniciando de novo!").catch(() => {});
    } catch {}

    try {
      const master = await c.users.fetch(OWNER);
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
