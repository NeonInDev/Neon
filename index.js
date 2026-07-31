require("dotenv").config();

const { client } = require("./src/client");
const { db } = require("./src/db");
const { TOKEN } = require("./src/config");
const { log, fechar: fecharLogger } = require("./src/logger");
const { fechar: fecharBrowser } = require("./src/browser");
const opencode = require("./src/opencode");
const apiPublica = require("./src/api_publica");
const monitor = require("./src/monitor");
const proativo = require("./src/proativo");
const agendados = require("./src/agendados");
const alarmes = require("./src/lembrete_alarme");

async function desligar(sinal) {
  log("INFO", `Desconectando (${sinal})...`);
  agendados.parar();
  proativo.parar();
  monitor.parar();
  opencode.parar();
  alarmes.parar();
  try {
    await db.write();
  } catch (err) {
    log("ERROR", "Erro ao salvar dados", { erro: err.message });
  }
  await fecharBrowser();
  client.destroy();
  await fecharLogger();
  process.exit(0);
}

client.once("clientReady", async () => {
  monitor.iniciar(client);
  proativo.iniciar(client);
  agendados.verificarCadaMinuto();
  alarmes.iniciar();
  opencode.iniciarServer().then(port => {
    if (port) log("INFO", `[OPENCODE] Servidor rodando na porta ${port}`);
    else log("INFO", "[OPENCODE] Servidor nao iniciado (opencode run continua disponivel)");
  });
  const apiPort = parseInt(process.env.API_PORT, 10) || 3000;
  apiPublica.iniciar(apiPort);
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
