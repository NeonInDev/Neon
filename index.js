require("dotenv").config();

const { client } = require("./src/client");
const { db } = require("./src/db");
const { TOKEN, PROATIVO } = require("./src/config");
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

function iniciarAPI() {
  try {
    const apiPort = parseInt(process.env.PORT || process.env.API_PORT, 10) || 3000;
    apiPublica.iniciar(apiPort);
  } catch (err) { log("ERROR", "[API] Falha ao iniciar", { erro: err.message }); }
}

function iniciarModulos() {
  try { monitor.iniciar(client); } catch (err) { log("ERROR", "[MONITOR] Falha ao iniciar", { erro: err.message }); }
  if (PROATIVO) {
    try { proativo.iniciar(client).catch(err => log("ERROR", "[PROATIVO] Falha ao iniciar", { erro: err.message })); } catch (err) { log("ERROR", "[PROATIVO] Falha ao iniciar", { erro: err.message }); }
  } else {
    log("INFO", "[PROATIVO] Modo autonomo desativado (PROATIVO=0)");
  }
  try { agendados.verificarCadaMinuto(); } catch (err) { log("ERROR", "[AGENDADOS] Falha ao iniciar", { erro: err.message }); }
  try { alarmes.iniciar(); } catch (err) { log("ERROR", "[ALARME] Falha ao iniciar", { erro: err.message }); }
  try { opencode.iniciarServer().then(port => port ? log("INFO", "[OPENCODE] Pronto", { port }) : log("WARN", "[OPENCODE] Servidor nao iniciou")); } catch (err) { log("ERROR", "[OPENCODE] Falha ao iniciar", { erro: err.message }); }
}

client.once("ready", () => {
  log("INFO", "Discord pronto");
  iniciarModulos();
});

iniciarAPI();

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

if (TOKEN) {
  const loginTimeout = setTimeout(() => {
    log("WARN", "[BOOT] Login no Discord demorou demais (30s). API segue rodando.");
  }, 30000);
  client.login(TOKEN).then(() => clearTimeout(loginTimeout)).catch((err) => {
    clearTimeout(loginTimeout);
    log("ERROR", "Falha ao conectar no Discord", { erro: err.message });
    if (!process.env.RENDER) process.exit(1);
  });
} else {
  log("WARN", "[BOOT] TOKEN ausente — iniciando modulos sem Discord.");
  iniciarModulos();
}
