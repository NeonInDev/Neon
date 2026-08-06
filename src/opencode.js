const { spawn } = require("child_process");
const { log } = require("./logger");
const axios = require("axios");
const path = require("path");
const os = require("os");

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
const CONFIG_DIR = path.join(__dirname, "..");

function envSeguro() {
  const e = { ...process.env };
  const allow = new Set(["OPENROUTER_API_KEY"]);
  for (const k of Object.keys(e)) {
    if (allow.has(k)) continue;
    if (/KEY|TOKEN|SECRET|PASS(WORD)?|AUTH|API/i.test(k)) delete e[k];
  }
  e.XDG_DATA_HOME = path.join(os.tmpdir(), "neon-ocdata");
  return e;
}

let serverProcess = null;
let serverPort = null;

async function iniciarServer() {
  if (serverProcess) return serverPort;
  parar();
  return new Promise((resolve) => {
    try {
      log("INFO", "[OPENCODE] Iniciando servidor...", { bin: OPENCODE_BIN, configDir: CONFIG_DIR, xdg: path.join(os.tmpdir(), "neon-ocdata") });

      const proc = spawn(OPENCODE_BIN, ["serve", "--port", "0", "--hostname", "127.0.0.1", "--print-logs"], {
        cwd: CONFIG_DIR,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
        env: envSeguro(),
      });

      let output = "";
      let settled = false;
      const finish = (port) => { if (!settled) { settled = true; serverPort = port; if (port) log("INFO", "[OPENCODE] Servidor OK", { port }); else { log("WARN", "[OPENCODE] Servidor nao iniciou"); if (output) log("WARN", "[OPENCODE] Logs do servidor", { output: output.slice(-500) }); } resolve(port); } };

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
        log("INFO", "[OPENCODE] Servidor encerrou", { code, output: output.slice(-300) });
      });

      setTimeout(() => finish(null), 20000);
      serverProcess = proc;
    } catch (err) {
      log("WARN", "[OPENCODE] Erro ao iniciar servidor", { erro: err.message });
      resolve(null);
    }
  });
}

async function executar(tarefa) {
  const maxAttempts = serverPort ? 1 : 0;

  if (!serverPort) {
    try {
      await iniciarServer();
    } catch {}
  }

  if (serverPort) {
    try {
      const res = await axios.post(`http://127.0.0.1:${serverPort}/chat`, { message: tarefa }, {
        timeout: 180000,
        responseType: "text",
        headers: { "Content-Type": "application/json", "Accept": "text/plain" },
      });
      const data = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      if (data && !data.startsWith("<!doctype") && !data.startsWith("<html")) return data.slice(0, 4000);
    } catch (err) {
      log("WARN", "[OPENCODE] HTTP falhou", { erro: err.message?.slice(0, 100) });
    }
  }

  try {
    const safe = tarefa.replace(/"/g, '\\"').replace(/\n/g, " ").slice(0, 2000);
    log("INFO", "[OPENCODE] Fallback CLI run", { tamTarefa: safe.length });
    const { exec: execCb } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(execCb);
    const { stdout } = await execAsync(`opencode run "${safe}"`, {
      cwd: CONFIG_DIR,
      timeout: 180000,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
      env: envSeguro(),
    });
    const result = stdout?.trim();
    return result?.length > 10 ? result.slice(0, 4000) : null;
  } catch (err) {
    log("WARN", "[OPENCODE] CLI falhou", { erro: err.message.slice(0, 100) });
    return null;
  }
}

function parar() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
    serverPort = null;
  }
}

module.exports = { iniciarServer, executar, parar };
