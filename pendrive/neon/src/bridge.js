const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

function genId() {
  return Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 6);
}

const BRIDGE_FILE = path.join(__dirname, "..", "temp", "opencode_bridge.json");

function ler() {
  try {
    if (!fs.existsSync(BRIDGE_FILE)) return { tasks: [], commands: [] };
    return JSON.parse(fs.readFileSync(BRIDGE_FILE, "utf8"));
  } catch { return { tasks: [], commands: [] }; }
}

function salvar(data) {
  fs.writeFileSync(BRIDGE_FILE, JSON.stringify(data, null, 2));
}

function pedirOpencode(prompt, userId) {
  const data = ler();
  const task = {
    id: genId(),
    from: "neon",
    userId,
    prompt,
    status: "pending",
    result: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  data.tasks.push(task);
  salvar(data);
  log("INFO", "[BRIDGE] Task enviada ao opencode", { id: task.id, prompt: prompt.slice(0, 80) });
  return task.id;
}

function checarTask(taskId) {
  const data = ler();
  return data.tasks.find(t => t.id === taskId) || null;
}

function aguardarTask(taskId, timeout = 300000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const iv = setInterval(() => {
      const task = checarTask(taskId);
      if (task && (task.status === "done" || task.status === "failed")) {
        clearInterval(iv);
        return resolve(task);
      }
      if (Date.now() - start > timeout) {
        clearInterval(iv);
        return resolve({ id: taskId, status: "timeout", result: null });
      }
    }, 1000);
  });
}

function getProximaTask() {
  const data = ler();
  const task = data.tasks.find(t => t.status === "pending");
  return task || null;
}

function concluirTask(taskId, result, failed = false) {
  const data = ler();
  const task = data.tasks.find(t => t.id === taskId);
  if (!task) return false;
  task.status = failed ? "failed" : "done";
  task.result = result;
  task.resolvedAt = new Date().toISOString();
  salvar(data);
  return true;
}

function getComandos() {
  const data = ler();
  return data.commands || [];
}

function addComando(from, action, payload) {
  const data = ler();
  const cmd = {
    id: genId(),
    from,
    to: from === "neon" ? "opencode" : "neon",
    action,
    payload,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  data.commands.push(cmd);
  salvar(data);
  return cmd.id;
}

function concluirComando(cmdId, result) {
  const data = ler();
  const cmd = data.commands.find(c => c.id === cmdId);
  if (!cmd) return false;
  cmd.status = "done";
  cmd.result = result;
  cmd.resolvedAt = new Date().toISOString();
  salvar(data);
  return true;
}

function limparTasksVelhas(maxAgeMs = 3600000) {
  const data = ler();
  const agora = Date.now();
  data.tasks = data.tasks.filter(t => agora - new Date(t.createdAt).getTime() < maxAgeMs);
  data.commands = data.commands.filter(c => agora - new Date(c.createdAt).getTime() < maxAgeMs);
  salvar(data);
}

let pollingInterval = null;

function iniciarPolling(client) {
  if (pollingInterval) return;
  log("INFO", "[BRIDGE] Polling de comandos iniciado");
  pollingInterval = setInterval(() => {
    try {
      const data = ler();
      const pendentes = data.commands.filter(c => c.status === "pending" && c.to === "neon");
      for (const cmd of pendentes) {
        log("INFO", "[BRIDGE] Executando comando", { id: cmd.id, action: cmd.action });
        executarComando(cmd, client).catch(err => {
          log("WARN", "[BRIDGE] Comando falhou", { id: cmd.id, erro: err.message });
          concluirComando(cmd.id, `Erro: ${err.message}`);
        });
      }
    } catch {}
  }, 2000);
}

async function executarComando(cmd, client) {
  switch (cmd.action) {
    case "send_dm": {
      if (!client || !cmd.payload?.userId || !cmd.payload?.content) break;
      const user = await client.users.fetch(cmd.payload.userId);
      if (user) await user.send(cmd.payload.content);
      concluirComando(cmd.id, "DM enviada");
      break;
    }
    case "send_message": {
      if (!client || !cmd.payload?.channelId || !cmd.payload?.content) break;
      const channel = await client.channels.fetch(cmd.payload.channelId);
      if (channel) await channel.send(cmd.payload.content);
      concluirComando(cmd.id, "Mensagem enviada");
      break;
    }
    default:
      log("WARN", "[BRIDGE] Comando desconhecido", { action: cmd.action });
      concluirComando(cmd.id, "Acao desconhecida");
  }
}

function pararPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

setInterval(limparTasksVelhas, 600000);

module.exports = {
  pedirOpencode,
  checarTask,
  aguardarTask,
  getProximaTask,
  concluirTask,
  getComandos,
  addComando,
  concluirComando,
  iniciarPolling,
  pararPolling,
};
