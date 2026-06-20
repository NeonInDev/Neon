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
    "opencode.cmd",
    "opencode",
  ];
  for (const c of candidates) {
    try {
      const r = require("child_process").execSync(`where "${c}" 2>nul`, { timeout: 2000, windowsHide: true, stdio: "pipe" }).toString().trim();
      if (r) return c;
    } catch {}
  }
  return "opencode.cmd";
}

const OPENCODE_BIN = getBinPath();

let serverProcess = null;
let serverPort = null;

async function iniciarServer() {
  if (serverProcess) return serverPort;
  parar();
  return new Promise((resolve) => {
    try {
      log("INFO", "[OPENCODE] Iniciando servidor...", { bin: OPENCODE_BIN });
      const proc = spawn(OPENCODE_BIN, ["serve", "--port", "0", "--hostname", "127.0.0.1", "--print-logs"], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });
      let output = "";
      let settled = false;
      const finish = (port) => { if (!settled) { settled = true; serverPort = port; if (port) log("INFO", "[OPENCODE] Servidor OK", { port }); else log("WARN", "[OPENCODE] Servidor nao iniciou"); resolve(port); } };
      proc.stdout.on("data", (data) => {
        const text = data.toString();
        output += text;
        const m = text.match(/http:\/\/127\.0\.0\.1:(\d+)/i);
        if (m) finish(parseInt(m[1]));
      });
      proc.stderr.on("data", (data) => {
        const text = data.toString();
        output += text;
        const m = text.match(/http:\/\/127\.0\.0\.1:(\d+)/i);
        if (m) finish(parseInt(m[1]));
      });
      proc.on("error", (err) => {
        log("WARN", "[OPENCODE] Erro ao iniciar servidor", { erro: err.message });
        finish(null);
      });
      proc.on("exit", (code) => {
        serverProcess = null;
        serverPort = null;
        log("INFO", "[OPENCODE] Servidor encerrou", { code, output: output.slice(-200) });
      });
      setTimeout(() => finish(null), 15000);
      serverProcess = proc;
    } catch (err) {
      log("WARN", "[OPENCODE] Erro ao iniciar servidor", { erro: err.message });
      resolve(null);
    }
  });
}

async function executar(tarefa) {
  if (serverPort) {
    try {
      const res = await axios.post(`http://127.0.0.1:${serverPort}/chat`, { message: tarefa }, {
        timeout: 120000,
        responseType: "text",
        headers: { "Content-Type": "application/json", "Accept": "text/plain" },
      });
      const data = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      if (data && !data.startsWith("<!doctype") && !data.startsWith("<html")) return data.slice(0, 2000);
      log("WARN", "[OPENCODE] Server retornou HTML, caindo pra CLI");
    } catch (err) {
      log("WARN", "[OPENCODE] HTTP falhou", { erro: err.message?.slice(0, 100) });
    }
  }
  try {
    const safe = tarefa.replace(/"/g, '\\"').replace(/\n/g, " ").slice(0, 1500);
    const { stdout } = await execAsync(`opencode run "${safe}"`, {
      timeout: 120000, windowsHide: true, maxBuffer: 5 * 1024 * 1024,
    });
    return stdout?.trim()?.slice(0, 2000) || "Sem resposta do OpenCode.";
  } catch (err) {
    log("WARN", "[OPENCODE] CLI falhou", { erro: err.message.slice(0, 100) });
    return null;
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
  }
}

module.exports = { iniciarServer, executar, gerarBlenderScript, parar };