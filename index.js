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
const opencode = require("./src/opencode");
const plugins = require("./src/plugin_loader");

async function desligar(sinal) {
  log("INFO", `Desconectando (${sinal})...`);
  await plugins.pararTodos();
  proativo.parar();
  monitor.parar();
  voice.parar();
  opencode.parar();
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
  await plugins.carregarTodos();
  monitor.iniciar(client);
  proativo.iniciar(client);
  opencode.iniciarServer().then(port => {
    if (port) log("INFO", `[OPENCODE] Servidor rodando na porta ${port}`);
    else log("INFO", "[OPENCODE] Servidor nao iniciado (opencode run continua disponivel)");
  });
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
