const { log } = require("./logger");
const voice = require("./voice");
const WAKE_OWNER_ID = "1454628188717191209";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let encerrando = false;

async function encerrar() {
  encerrando = true;
  await voice.parar();
  process.exit(0);
}

process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);

async function manterOuvinteAtivo() {
  log("INFO", "[VOICE-WAKE] Serviço de ativação iniciado; frase: Neon deploy");
  while (!encerrando) {
    if (!voice.status().ativo) {
      await voice.parar().catch(() => {});
      const iniciou = await voice.iniciar(WAKE_OWNER_ID, "Neon Wake", { wakeOnly: true }).catch((err) => {
        log("WARN", "[VOICE-WAKE] Não conseguiu abrir o microfone", { erro: err.message });
        return false;
      });
      if (!iniciou) await delay(15_000);
    } else {
      await delay(5_000);
    }
  }
}

manterOuvinteAtivo().catch((err) => {
  log("ERROR", "[VOICE-WAKE] Serviço terminou inesperadamente", { erro: err.message });
  process.exitCode = 1;
});
