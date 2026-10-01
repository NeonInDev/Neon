const { log } = require("./logger");
const { db } = require("./db");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);
const { OWNER } = require("./perm");

const SCHEDULE_KEY = "scheduled_tasks";
let checkInterval = null;
let client = null;

function iniciar(discordClient) {
  client = discordClient;
  if (!db.data[SCHEDULE_KEY]) db.data[SCHEDULE_KEY] = [];
  const temRotina = (db.data[SCHEDULE_KEY] || []).find(t => t.tipo === "rotina" && t.ativo !== false);
  if (!temRotina) {
    agendar("rotina", { userId: OWNER, proximo: Date.now(), recorrencia: "1d", diasUteis: true, texto: "rotina diaria" });
    log("INFO", "[SCHEDULER] Rotina diaria agendada para o dono");
  }
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
  const diaDaSemana = new Date().getDay();
  if (tarefa.diasUteis && (diaDaSemana === 0 || diaDaSemana === 6)) {
    log("INFO", "[SCHEDULER] Pulada (fim de semana)", { tipo: tarefa.tipo });
    return;
  }
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
        const { stdout, stderr } = await execAsync(tarefa.alvo, { timeout: 30000, windowsHide: true });
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
      case "rotina": {
        if (client?.isReady() && tarefa.userId) {
          const nomes = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
          const focos = [
            "Livro/estudo leve + planejar a próxima semana",
            "C / Arduino - montar 1 circuito no Wokwi",
            "Python - mini-projeto do dia (calculadora, senha, script)",
            "C / Arduino - circuito real/esboço (LED, botão, servo)",
            "Python - resolver 1 bug/desafio",
            "JavaScript - 1 página simples (HTML/CSS/JS)",
            "Projeto aberto / robótica grande + anotar progresso"
          ];
          const wd = new Date().getDay();
          const user = await client.users.fetch(tarefa.userId);
          await user.send(
            `📅 **Sua rotina de ${nomes[wd]}**\n\n` +
            `☀️ 08:30 - Acordar, café e estudar\n` +
            `🎮 10:00 - Jogar\n` +
            `🍚 11:00 - Arrumar + almoçar\n` +
            `💻 12:00 - Programação: **${focos[wd]}**\n` +
            `🏫 13:30 - Escola\n` +
            `🥪 17:20 - Café + se arrumar\n` +
            `💪 18:00 - Treinar/malhar\n` +
            `🧹 19:30 - Arrumar a casa\n` +
            `🕹️ 20:30 - Livre (jogar/estudar/tarefas)\n` +
            `📖 21:45 - Ler a Bíblia antes de dormir\n\n` +
            (wd === 0 || wd === 6
              ? `Fim de semana é descanso, mas mantém o foco! 🛡️`
              : `Missão do dia: seguir o cronograma de ponta a ponta. Você consegue! 💪`)
          );
          log("INFO", "[SCHEDULER] Rotina diária enviada");
        }
        break;
      }
      case "arquivo": {
        if (client?.isReady() && tarefa.userId && tarefa.alvo) {
          const nome = tarefa.texto || String(tarefa.alvo).split(/[\\/]/).pop() || "Arquivo da Neon";
          const user = await client.users.fetch(tarefa.userId);
          await user.send({ content: `📄 **${nome}**`, files: [tarefa.alvo] });
          log("INFO", "[SCHEDULER] Arquivo enviado", { arquivo: tarefa.alvo });
        }
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
