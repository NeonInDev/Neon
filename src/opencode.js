const { spawn } = require("child_process");
const { log } = require("./logger");
const axios = require("axios");
const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(execCb);

let serverProcess = null;
let serverPort = null;

async function iniciarServer() {
  if (serverProcess) return serverPort;
  return new Promise((resolve) => {
    try {
      const proc = spawn("opencode", ["serve", "--port", "0", "--hostname", "127.0.0.1"], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      proc.stdout.on("data", (data) => {
        output += data.toString();
        const portMatch = output.match(/listening on.*?:(\d+)/i) || output.match(/port[:\s]*(\d+)/i) || output.match(/http:\/\/127\.0\.0\.1:(\d+)/i);
        if (portMatch && !serverPort) {
          serverPort = parseInt(portMatch[1]);
          serverProcess = proc;
          log("INFO", `[OPENCODE] Server started on port ${serverPort}`);
          resolve(serverPort);
        }
      });
      proc.stderr.on("data", (data) => {
        const text = data.toString();
        output += text;
        const portMatch = text.match(/listening on.*?:(\d+)/i) || text.match(/port[:\s]*(\d+)/i) || text.match(/http:\/\/127\.0\.0\.1:(\d+)/i);
        if (portMatch && !serverPort) {
          serverPort = parseInt(portMatch[1]);
          serverProcess = proc;
          log("INFO", `[OPENCODE] Server started on port ${serverPort} (stderr)`);
          resolve(serverPort);
        }
      });
      proc.on("error", (err) => {
        log("WARN", "[OPENCODE] Failed to start server", { erro: err.message });
        resolve(null);
      });
      proc.on("exit", () => {
        serverProcess = null;
        serverPort = null;
        log("INFO", "[OPENCODE] Server stopped");
      });
      setTimeout(() => {
        if (!serverPort) {
          log("WARN", "[OPENCODE] Server start timeout");
          resolve(null);
        }
      }, 10000);
    } catch (err) {
      log("WARN", "[OPENCODE] Error starting server", { erro: err.message });
      resolve(null);
    }
  });
}

async function executar(tarefa) {
  try {
    const { stdout, stderr } = await execAsync(`opencode run "${tarefa.replace(/"/g, '\\"')}"`, { timeout: 120000, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });
    return stdout?.trim() || stderr?.trim() || "Sem resposta do OpenCode.";
  } catch (err) {
    return `Erro OpenCode: ${err.message.slice(0, 200)}`;
  }
}

function parar() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
    serverPort = null;
    log("INFO", "[OPENCODE] Server stopped");
  }
}

module.exports = { iniciarServer, executar, parar };