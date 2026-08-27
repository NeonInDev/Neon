const fs = require("fs");
const { spawn } = require("child_process");
const { log } = require("../src/logger");
const http = require("http");
const path = require("path");
const os = require("os");

function getBinPath() {
  const npmDir = path.join(process.env.APPDATA || "", "npm");
  const direto = path.join(npmDir, "node_modules", "opencode-ai", "bin", "opencode.exe");
  try {
    if (fs.existsSync(direto)) return direto;
  } catch {}
  const candidates = ["opencode.cmd", "opencode"];
  for (const c of candidates) {
    try {
      const r = require("child_process").execSync(`where "${c}" 2>nul`, { timeout: 2000, windowsHide: true, stdio: "pipe" }).toString().trim();
      if (r) return c;
    } catch {}
  }
  return "opencode.cmd";
}

const OPENCODE_BIN = getBinPath();
const USAR_SHELL = !/\.exe$/i.test(OPENCODE_BIN);
const CONFIG_DIR = path.join(__dirname, "..");

function envSeguro() {
  const e = { ...process.env };
  const allow = new Set(["OPENROUTER_API_KEY", "DEEPSEEK_API_KEY", "GROQ_API_KEY", "API_PORT"]);
  for (const k of Object.keys(e)) {
    if (allow.has(k)) continue;
    if (/KEY|TOKEN|SECRET|PASS(WORD)?|AUTH|API/i.test(k)) delete e[k];
  }
  e.XDG_DATA_HOME = path.join(os.tmpdir(), "neon-ocdata");
  return e;
}

let serverProcess = null;
let serverPort = null;
let desligando = false;
let tentativasRestart = 0;
let reiniciador = null;

function httpReq(method, port, pathname, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        host: "127.0.0.1",
        port,
        path: pathname,
        method,
        timeout: timeoutMs,
        headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {},
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(buf);
            if (j && j.info && j.info.name && j.info.name !== "Text") resolve(j);
            else resolve(j);
          } catch {
            resolve(buf);
          }
        });
      }
    );
    r.on("timeout", () => {
      r.destroy();
      reject(new Error("timeout"));
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

async function esperarHealth(port, tempoMaxMs = 30000) {
  const inicio = Date.now();
  while (Date.now() - inicio < tempoMaxMs) {
    try {
      await httpReq("GET", port, "/global/health", null, 2000);
      return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function iniciarServer() {
  if (serverProcess) return Promise.resolve(serverPort);
  desligando = false;
  clearTimeout(reiniciador);

  return new Promise((resolve) => {
    try {
      // mata servidor orfao deixado por um boot anterior (node morto na forca)
      const arqPid = path.join(__dirname, "..", "data", "opencode_server.pid");
      try {
        const velho = parseInt(fs.readFileSync(arqPid, "utf8"));
        if (velho && velho > 0) {
          const saida = require("child_process")
            .execSync(`tasklist /fi "PID eq ${velho}" /fo list`, { timeout: 3000, windowsHide: true, stdio: "pipe" })
            .toString();
          if (/opencode/i.test(saida)) {
            try { process.kill(velho); log("INFO", "[OPENCODE] Servidor orfao do boot anterior encerrado", { pid: velho }); } catch {}
          }
        }
      } catch {}

      log("INFO", "[OPENCODE] Iniciando servidor...", { bin: OPENCODE_BIN });

      const proc = spawn(OPENCODE_BIN, ["serve", "--port", "0", "--hostname", "127.0.0.1", "--print-logs"], {
        cwd: CONFIG_DIR,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        shell: USAR_SHELL,
        env: envSeguro(),
      });

      let output = "";
      let settled = false;
      const finish = (port) => {
        if (settled) return;
        settled = true;
        serverPort = port;
        if (port) {
          log("INFO", "[OPENCODE] Servidor OK", { port });
        } else {
          log("WARN", "[OPENCODE] Servidor nao iniciou", { output: output.slice(-400) });
        }
        resolve(port);
      };

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
        const foiServer = serverProcess === proc;
        serverProcess = null;
        serverPort = null;
        log("INFO", "[OPENCODE] Servidor encerrou", { code });
        if (foiServer && !desligando && tentativasRestart < 5) {
          tentativasRestart += 1;
          log("INFO", `[OPENCODE] Reiniciando em 3s (tentativa ${tentativasRestart})...`);
          reiniciador = setTimeout(() => iniciarServer(), 3000);
        } else if (!desligando) {
          log("WARN", "[OPENCODE] Desistindo de reiniciar (muitas falhas).");
        }
      });

      proc.on("spawn", () => {
        try {
          fs.writeFileSync(path.join(__dirname, "..", "data", "opencode_server.pid"), String(proc.pid));
        } catch {}
      });

      setTimeout(() => finish(null), 30000);
      serverProcess = proc;
    } catch (err) {
      log("WARN", "[OPENCODE] Erro ao iniciar servidor", { erro: err.message });
      resolve(null);
    }
  });
}

async function executar(tarefa) {
  if (!tarefa || !String(tarefa).trim()) return null;
  const maxAttempts = 2;
  let tentativa = 0;

  while (tentativa < maxAttempts) {
    tentativa += 1;

    if (!serverPort) {
      try {
        await iniciarServer();
      } catch {}
    }

    if (serverPort) {
      try {
        const port = serverPort;
        const sessao = await httpReq("POST", port, "/session", { title: "neon-codar" }, 30000);
        const sessaoId = sessao?.id;
        if (!sessaoId) throw new Error("sem id de sessao");

        const msg = await httpReq(
          "POST",
          port,
          `/session/${sessaoId}/message`,
          {
            agent: "neon",
            model: { providerID: "opencode", modelID: "big-pickle" },
            parts: [{ type: "text", text: tarefa }],
          },
          300000
        );

        if (msg && msg.info && msg.info.name && msg.info.name !== "Text") {
          throw new Error(`opencode: ${msg.info.data?.message || msg.info.name}`);
        }

        const partes = msg?.parts || [];
        const texto = partes.filter((p) => p.type === "text").map((p) => p.text).join("\n").trim();
        if (texto && texto.length > 2) {
          tentativasRestart = 0;
          return texto.slice(0, 4000);
        }
        throw new Error("resposta vazia do opencode serve");
      } catch (err) {
        const isConnErr = err.message?.includes("ECONNREFUSED") || err.message?.includes("ECONNRESET") || err.message?.includes("ENOTFOUND");
        log("WARN", `[OPENCODE] HTTP falhou (tentativa ${tentativa})`, { erro: err.message?.slice(0, 120), conn: isConnErr });
        if (tentativa >= maxAttempts) {
          if (isConnErr) parar();
          break;
        }
        if (isConnErr) {
          parar();
          await new Promise((r) => setTimeout(r, 3000));
        } else {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    } else {
      break;
    }
  }

  log("WARN", "[OPENCODE] Servidor falhou; sem fallback CLI");
  return null;
}

async function decidir(tarefa) {
  const instrucoes = [
    "Você é o roteador de ações da Neon.",
    "Analise a mensagem abaixo.",
    "Se for conversa, dúvida, cumprimento ou pedido que não exige executar nada no computador, responda exatamente: __NEON_PASS__",
    "Se for uma ação explícita, execute-a agora usando suas ferramentas. Depois responda em português brasileiro, em uma frase curta, começando exatamente por: __NEON_ACTION__",
    "Nunca diga que executou algo sem executar. Para abrir programas no Windows, use Start-Process ou start \"\" \"<nome>\" como interface gráfica.",
    "",
    `Mensagem do usuário: ${String(tarefa).slice(0, 3000)}`,
  ].join("\n");

  const resposta = await executar(instrucoes);
  if (!resposta) return { acao: false, resposta: null };

  const texto = resposta.trim();
  if (texto.startsWith("__NEON_ACTION__")) {
    const final = texto.replace(/^__NEON_ACTION__\s*/i, "").trim();
    return { acao: Boolean(final), resposta: final || null };
  }

  return { acao: false, resposta: null };
}

function parar() {
  desligando = true;
  clearTimeout(reiniciador);
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {}
    serverProcess = null;
    serverPort = null;
  }
}

module.exports = { iniciarServer, executar, decidir, parar };
