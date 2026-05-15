const { db, initDB } = require("../db");
const { log } = require("../logger");
const { startDocsServer, getUrl } = require("../docs/server");

module.exports = {
  name: "clientReady",
  once: true,
  async execute(c) {
    await initDB();

    const port = await startDocsServer();
    const url = getUrl(port);

    log("INFO", `Documentação disponível em ${url}`);
    log("INFO", "Client conectado", { tag: c.user.tag, guilds: c.guilds.cache.size });
  },
};
