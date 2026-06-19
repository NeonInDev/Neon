const { spawn } = require("child_process");
const { log } = require("./logger");
const axios = require("axios");
const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const execAsync = promisify(execCb);

function getBinPath() {
  const npmDir = path.join(process.env.APPDATA || "", "npm");
  const candidates = [
    path.join(npmDir, "node_modules", "opencode-ai", "bin", "opencode.exe"),
    path.join(npmDir, "opencode.cmd"),
    "opencode",
    "opencode.cmd",
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c) || c === "opencode" || c === "opencode.cmd") { const r = require("child_process").execSync(`where "${c}"`, { timeout: 2000, windowsHide: true, stdio: "pipe" }).toString().trim(); if (r) return c; } } catch {}
  }
  return "opencode.cmd";
}

const OPENCODE_BIN = getBinPath();

let serverProcess = null;
let serverPort = null;

async function iniciarServer() {
  if (serverProcess) return serverPort;
  return new Promise((resolve) => {
    try {
      const proc = spawn(OPENCODE_BIN, ["serve", "--port", "0", "--hostname", "127.0.0.1"], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });
      let output = "";
      let settled = false;
      const finish = (port) => { if (!settled) { settled = true; serverPort = port; resolve(port); } };
      proc.stdout.on("data", (data) => {
        output += data.toString();
        const portMatch = output.match(/listening on.*?:(\d+)/i) || output.match(/port[:\s]*(\d+)/i) || output.match(/http:\/\/127\.0\.0\.1:(\d+)/i);
        if (portMatch) finish(parseInt(portMatch[1]));
      });
      proc.stderr.on("data", (data) => {
        const text = data.toString();
        output += text;
        const portMatch = text.match(/listening on.*?:(\d+)/i) || text.match(/port[:\s]*(\d+)/i) || text.match(/http:\/\/127\.0\.0\.1:(\d+)/i);
        if (portMatch) finish(parseInt(portMatch[1]));
      });
      proc.on("error", (err) => {
        log("WARN", "[OPENCODE] Failed to start server", { erro: err.message });
        finish(null);
      });
      proc.on("exit", () => {
        serverProcess = null;
        serverPort = null;
        log("INFO", "[OPENCODE] Server stopped");
      });
      setTimeout(() => finish(null), 10000);
      serverProcess = proc;
    } catch (err) {
      log("WARN", "[OPENCODE] Error starting server", { erro: err.message });
      resolve(null);
    }
  });
}

async function executar(tarefa) {
  if (serverPort) {
    try {
      const res = await axios.post(`http://127.0.0.1:${serverPort}/chat`, {
        message: tarefa,
      }, { timeout: 120000, responseType: "text" });
      let data = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      return data?.slice(0, 2000) || "Sem resposta.";
    } catch {
      log("WARN", "[OPENCODE] HTTP fallback, usando CLI");
    }
  }
  try {
    const { stdout, stderr } = await execAsync(`opencode run "${tarefa.replace(/"/g, '\\"')}"`, { timeout: 120000, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });
    return stdout?.trim()?.slice(0, 2000) || stderr?.trim()?.slice(0, 1000) || "Sem resposta do OpenCode.";
  } catch (err) {
    return `Erro OpenCode: ${err.message.slice(0, 200)}`;
  }
}

async function gerarBlenderScript(descricao) {
  return await executar(`Gere APENAS codigo Python para Blender 3D ${descricao}. Retorne SOMENTE o codigo Python puro, sem \`\`\` markers, sem texto antes ou depois.`);
}

function parar() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
    serverPort = null;
    log("INFO", "[OPENCODE] Server stopped");
  }
}

module.exports = { iniciarServer, executar, gerarBlenderScript, parar };