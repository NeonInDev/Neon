const { log } = require("./logger");
const { db } = require("./db");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

const SCHEDULE_KEY = "scheduled_tasks";
let checkInterval = null;
let client = null;

function iniciar(discordClient) {
  client = discordClient;
  if (!db.data[SCHEDULE_KEY]) db.data[SCHEDULE_KEY] = [];
  log("INFO", "[SCHEDULER] Iniciado");
  checkInterval = setInterval(verificarTarefas, 30 * 1000);
}

function parar() {
  if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }
  log("INFO", "[SCHEDULER] Parado");
}

async function verificarTarefas() {
  try {
    const tarefas = db.data[SCHEDULE_KEY] || [];
    if (tarefas.length === 0) return;
    const agora = Date.now();
    const pendentes = tarefas.filter(t => t.proximo && t.proximo <= agora && t.ativo !== false);
    if (pendentes.length === 0) return;
    for (const t of pendentes) {
      await executarTarefa(t);
      if (t.recorrencia) {
        t.proximo = calcularProximo(t.recorrencia);
      } else {
        t.ativo = false;
      }
    }
    db.data[SCHEDULE_KEY] = tarefas.filter(t => t.ativo !== false);
    await db.write();
  } catch (err) {
    log("WARN", "[SCHEDULER] Erro na verificação", { erro: err.message });
  }
}

function calcularProximo(recorrencia) {
  const agora = new Date();
  switch (recorrencia) {
    case "1min": return agora.getTime() + 60000;
    case "5min": return agora.getTime() + 300000;
    case "30min": return agora.getTime() + 1800000;
    case "1h": return agora.getTime() + 3600000;
    case "6h": return agora.getTime() + 21600000;
    case "12h": return agora.getTime() + 43200000;
    case "1d": return agora.getTime() + 86400000;
    case "1sem": return agora.getTime() + 604800000;
    default: return null;
  }
}

async function executarTarefa(tarefa) {
  log("INFO", "[SCHEDULER] Executando tarefa", { tipo: tarefa.tipo, alvo: tarefa.alvo });
  try {
    switch (tarefa.tipo) {
      case "mensagem": {
        if (client?.isReady() && tarefa.userId) {
          const user = await client.users.fetch(tarefa.userId);
          await user.send(`⏰ **Lembrete:** ${tarefa.texto}`);
          log("INFO", "[SCHEDULER] Mensagem enviada");
        }
        break;
      }
      case "comando": {
        const { stdout, stderr } = await execAsync(tarefa.alvo, { timeout: 30000 });
        if (stderr && !stdout) log("WARN", "[SCHEDULER] Erro no comando", { erro: stderr });
        else log("INFO", "[SCHEDULER] Comando executado", { saida: stdout?.slice(0, 200) });
        if (tarefa.userId && client?.isReady()) {
          const user = await client.users.fetch(tarefa.userId);
          const saida = stdout?.slice(0, 1000) || "(sem saída)";
          await user.send(`✅ **Tarefa automática:** ${tarefa.alvo}\n\`\`\`\n${saida}\n\`\`\``);
        }
        break;
      }
      case "notificar": {
        const user = await client.users.fetch(tarefa.userId);
        await user.send(`🔔 **Notificação automática:** ${tarefa.texto}`);
        break;
      }
      default:
        log("WARN", "[SCHEDULER] Tipo desconhecido", { tipo: tarefa.tipo });
    }
  } catch (err) {
    log("WARN", "[SCHEDULER] Falha na tarefa", { erro: err.message });
    if (tarefa.userId && client?.isReady()) {
      try {
        const user = await client.users.fetch(tarefa.userId);
        await user.send(`❌ **Tarefa falhou:** ${tarefa.texto || tarefa.alvo}\nErro: ${err.message}`);
      } catch {}
    }
  }
}

function agendar(tipo, dados) {
  if (!db.data[SCHEDULE_KEY]) db.data[SCHEDULE_KEY] = [];
  const tarefa = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    tipo,
    ...dados,
    criado: Date.now(),
    ativo: true,
  };
  db.data[SCHEDULE_KEY].push(tarefa);
  db.write();
  return tarefa;
}

function listarTarefas() {
  return (db.data[SCHEDULE_KEY] || []).filter(t => t.ativo !== false);
}

function cancelarTarefa(id) {
  const tarefas = db.data[SCHEDULE_KEY] || [];
  const idx = tarefas.findIndex(t => t.id === id);
  if (idx >= 0) {
    tarefas[idx].ativo = false;
    db.data[SCHEDULE_KEY] = tarefas;
    db.write();
    return true;
  }
  return false;
}

module.exports = { iniciar, parar, agendar, listarTarefas, cancelarTarefa };
