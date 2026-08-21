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

    log("INFO", "Client conectado", {
      tag: c.user.tag,
      guilds: c.guilds.cache.size,
    });
  },
};
