const { db, initDB } = require("../db");
const { log } = require("../logger");

module.exports = {
  name: "clientReady",
  once: true,
  async execute(c) {
    await initDB();
    log("INFO", "Client conectado", { tag: c.user.tag, guilds: c.guilds.cache.size });
  },
};
