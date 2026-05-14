require("dotenv").config();

const { client } = require("./src/client");
const { db } = require("./src/db");
const { TOKEN } = require("./src/config");
const { log } = require("./src/logger");

async function desligar(sinal) {
  log("INFO", `Desconectando (${sinal})...`);
  try {
    await db.write();
  } catch (err) {
    log("ERROR", "Erro ao salvar dados", { erro: err.message });
  }
  client.destroy();
  process.exit(0);
}

process.on("SIGINT", () => desligar("SIGINT"));
process.on("SIGTERM", () => desligar("SIGTERM"));

process.on("unhandledRejection", (err) => {
  log("ERROR", "Promessa rejeitada sem tratamento", { erro: err.message });
});

process.on("uncaughtException", (err) => {
  log("ERROR", "Exceção não capturada", { erro: err.message, stack: err.stack });
  client.destroy();
  process.exit(1);
});

client.login(TOKEN);
