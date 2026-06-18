require("dotenv").config();

const { client } = require("./src/client");
const { db } = require("./src/db");
const { TOKEN } = require("./src/config");
const { log } = require("./src/logger");
const { stopDocsServer } = require("./src/docs/server");
const { fechar: fecharBrowser } = require("./src/browser");
const voice = require("./src/voice");
const monitor = require("./src/monitor");
const proativo = require("./src/proativo");

async function desligar(sinal) {
  log("INFO", `Desconectando (${sinal})...`);
  proativo.parar();
  monitor.parar();
  voice.parar();
  try {
    await db.write();
  } catch (err) {
    log("ERROR", "Erro ao salvar dados", { erro: err.message });
  }
  stopDocsServer();
  await fecharBrowser();
  client.destroy();
  process.exit(0);
}

client.once("clientReady", async () => {
  const ok = await voice.iniciar("1442928336329379925", "Dono");
  if (ok) log("INFO", "[VOICE] Microfone auto-iniciado");
  monitor.iniciar(client);
  proativo.iniciar(client);
});

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
