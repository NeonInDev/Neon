const { db, initDB } = require("../db");
const { log } = require("../logger");
const { startDocsServer, getUrl } = require("../docs/server");

module.exports = {
  name: "clientReady",
  once: true,
  async execute(c) {
    await initDB();

    try {
      const port = await startDocsServer();
      log("INFO", `Documentação disponível em ${getUrl(port)}`);
    } catch (err) {
      log("WARN", "Servidor de documentação não iniciou", { erro: err.message });
    }

    log("INFO", "Client conectado", {
      tag: c.user.tag,
      guilds: c.guilds.cache.size,
    });
  },
};
