const { spawn } = require("child_process");
const path = require("path");
const { log } = require("./logger");
const pc = require("./pc");

const SCRIPT = path.join(__dirname, "scripts", "voice_listener.ps1");
let processo = null;
let ativo = false;
let ownerId = null;
let ownerUsername = "dono";

function onComando(fn) {
  global.__neonVoiceCb = fn;
}

function iniciar(id, username) {
  if (ativo) return false;
  ownerId = id;
  ownerUsername = username || "dono";

  processo = spawn("powershell", [
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", SCRIPT,
  ], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  processo.stdout.on("data", async (data) => {
    const linhas = data.toString("utf8").trim().split("\n");
    for (const linha of linhas) {
      const texto = linha.trim();
      if (!texto || texto.length < 2) continue;
      log("INFO", "[VOICE] Comando por voz", { texto });
      try {
        await pc.tts(`Entendido: ${texto.slice(0, 60)}`);
      } catch {}
      try {
        const { executarAcao } = require("./actions");
        const resultado = await executarAcao(texto, true, ownerId);
        if (resultado) {
          const limpo = resultado.replace(/[*_`~|#]/g, "").slice(0, 200);
          await pc.tts(limpo);
          if (global.__neonVoiceCb) global.__neonVoiceCb(texto, resultado);
          return;
        }
      } catch (err) {
        log("WARN", "[VOICE] executarAcao falhou", { erro: err.message });
      }
      try {
        const { askNeon } = require("./ai");
        const reply = await askNeon(ownerId, ownerUsername, texto);
        const limpo = reply.replace(/[*_`~|#]/g, "").slice(0, 200);
        await pc.tts(limpo);
        if (global.__neonVoiceCb) global.__neonVoiceCb(texto, limpo);
      } catch (err) {
        log("ERROR", "[VOICE] Erro ao processar comando via IA", { erro: err.message });
        try { await pc.tts("Desculpe, não entendi."); } catch {}
      }
    }
  });

  processo.stderr.on("data", (data) => {
    log("WARN", "[VOICE] stderr", { msg: data.toString().trim() });
  });

  processo.on("close", (code) => {
    log("INFO", "[VOICE] Processo encerrado", { code });
    ativo = false;
    processo = null;
  });

  processo.on("error", (err) => {
    log("ERROR", "[VOICE] Erro no processo", { erro: err.message });
    ativo = false;
    processo = null;
  });

  ativo = true;
  log("INFO", "[VOICE] Escuta de microfone iniciada");
  return true;
}

function parar() {
  if (!ativo || !processo) return false;
  try {
    processo.stdin.write("QUIT\n");
    processo.stdin.end();
  } catch {}
  try { processo.kill(); } catch {}
  processo = null;
  ativo = false;
  log("INFO", "[VOICE] Escuta de microfone parada");
  return true;
}

function status() {
  return { ativo, ownerId };
}

module.exports = { iniciar, parar, status, onComando };
