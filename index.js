require("dotenv").config();
const dns = require("dns");
try { dns.setDefaultResultOrder("ipv4first"); } catch {}

const { client } = require("./src/client");
const { db } = require("./src/db");
const { TOKEN, PROATIVO } = require("./src/config");
const { log, fechar: fecharLogger } = require("./src/logger");
const { fechar: fecharBrowser } = require("./src/browser");
const opencode = require("./plugins/opencode");
const apiPublica = require("./src/api_publica");
const monitor = require("./src/monitor");
const proativo = require("./src/proativo");
const agendados = require("./src/agendados");
const alarmes = require("./src/lembrete_alarme");
const plugins = require("./plugins/gerenciador");
const skills = require("./src/skills");
async function desligar(sinal) {
  log("INFO", `Desconectando (${sinal})...`);
  await plugins.parar();
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
  try { skills.iniciar(); } catch (err) { log("ERROR", "[SKILLS] Falha ao iniciar", { erro: err.message }); }
  try { monitor.iniciar(client); } catch (err) { log("ERROR", "[MONITOR] Falha ao iniciar", { erro: err.message }); }
  if (PROATIVO) {
    try { proativo.iniciar(client).catch(err => log("ERROR", "[PROATIVO] Falha ao iniciar", { erro: err.message })); } catch (err) { log("ERROR", "[PROATIVO] Falha ao iniciar", { erro: err.message }); }
  } else {
    log("INFO", "[PROATIVO] Modo autonomo desativado (PROATIVO=0)");
  }
  try { agendados.verificarCadaMinuto(); } catch (err) { log("ERROR", "[AGENDADOS] Falha ao iniciar", { erro: err.message }); }
  try { alarmes.iniciar(); } catch (err) { log("ERROR", "[ALARME] Falha ao iniciar", { erro: err.message }); }
  try { opencode.iniciarServer().then(port => port ? log("INFO", "[OPENCODE] Pronto", { port }) : log("WARN", "[OPENCODE] Servidor nao iniciou")); } catch (err) { log("ERROR", "[OPENCODE] Falha ao iniciar", { erro: err.message }); }
  try { plugins.iniciar(client); } catch (err) { log("ERROR", "[PLUGINS] Falha ao iniciar", { erro: err.message }); }
}

client.once("ready", () => {
  log("INFO", "Discord pronto");
  iniciarModulos();
  // efeito sonoro de boot quando roda no PC local
  try { require("./src/som").tocar("online"); } catch {}
});

iniciarAPI();

process.on("SIGINT", () => desligar("SIGINT"));
process.on("SIGTERM", () => desligar("SIGTERM"));

process.on("unhandledRejection", (err) => {
  log("ERROR", "Promessa rejeitada sem tratamento", { erro: err.message });
});

process.on("uncaughtException", async (err) => {
  log("ERROR", "Exceção não capturada", { erro: err.message, stack: err.stack?.slice(0, 2000) });
  // Tenta salvar o banco antes de reiniciar (o start.bat reinicia sozinho)
  try { await db.write(); } catch (e2) { log("ERROR", "Erro ao salvar dados no crash", { erro: e2.message }); }
  try { client.destroy(); } catch (e3) { /* ignora */ }
  setTimeout(() => process.exit(1), 300);
});

if (TOKEN) {
  async function tentarLogin() {
    try {
      log("INFO", "[BOOT] Conectando no Discord...");
      await client.login(TOKEN);
    } catch (err) {
      log("ERROR", "[BOOT] Falha ao conectar no Discord", { erro: err.message });
      if (!process.env.RENDER) process.exit(1);
      log("WARN", "[BOOT] Tentando de novo em 30s (Render)...");
      setTimeout(tentarLogin, 30000);
    }
  }
  const loginTimeout = setTimeout(() => {
    log("WARN", "[BOOT] Login no Discord ainda pendente (60s). API segue rodando; reconexao automatica do discord.js cuida disso.");
  }, 60000);
  client.once("ready", () => clearTimeout(loginTimeout));
  tentarLogin();
} else {
  log("WARN", "[BOOT] TOKEN ausente — iniciando modulos sem Discord.");
  iniciarModulos();
}
