const OBSWebSocket = require("obs-websocket-js").default;
const { log } = require("./logger");

const HOST = "localhost";
const PORT = 4455;
const PASSWORD = process.env.OBS_PASSWORD || "";

let obs = null;
let conectado = false;

async function conectar() {
  if (conectado) return true;
  try {
    obs = new OBSWebSocket();
    await obs.connect(`ws://${HOST}:${PORT}`, PASSWORD, { rpcVersion: 1 });
    conectado = true;
    log("INFO", "[OBS] Conectado");
    obs.on("ConnectionClosed", () => {
      conectado = false;
      log("WARN", "[OBS] Conexao fechada");
    });
    return true;
  } catch (err) {
    conectado = false;
    log("WARN", "[OBS] Falha ao conectar", { erro: err.message });
    return false;
  }
}

async function desconectar() {
  if (obs && conectado) {
    try { await obs.disconnect(); } catch {}
    conectado = false;
  }
}

async function getStatus() {
  if (!await conectar()) return null;
  try {
    const status = await obs.call("GetRecordStatus");
    return status;
  } catch (err) {
    log("WARN", "[OBS] Erro ao obter status", { erro: err.message });
    return null;
  }
}

async function startRecording() {
  if (!await conectar()) return "❌ OBS nao esta rodando ou websocket nao conectado.";
  try {
    const status = await obs.call("GetRecordStatus");
    if (status.outputActive) return "⚠️ OBS ja esta gravando.";
    await obs.call("StartRecord");
    return "🔴 Gravacao iniciada!";
  } catch (err) {
    return `❌ Erro ao iniciar gravacao: ${err.message}`;
  }
}

async function stopRecording() {
  if (!await conectar()) return "❌ OBS nao esta rodando ou websocket nao conectado.";
  try {
    const status = await obs.call("GetRecordStatus");
    if (!status.outputActive) return "⚠️ OBS nao esta gravando.";
    await obs.call("StopRecord");
    return "⏹️ Gravacao parada!";
  } catch (err) {
    return `❌ Erro ao parar gravacao: ${err.message}`;
  }
}

module.exports = { conectar, desconectar, getStatus, startRecording, stopRecording };
