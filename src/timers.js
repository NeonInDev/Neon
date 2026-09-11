const { log } = require("./logger");

const lembretes = new Map();
let idCounter = 0;

// Lembretes recorrentes: a cada disparo, reagenda automaticamente.
// Opções de recorrência (em criarLembreteRecorrente):
//   { tipo: "diario", hora: "07:30" }
//   { tipo: "semanal", dia: 1, hora: "07:30" }   // dia: 0=domingo..6=sabado
//   { tipo: "intervalo", ms: 3600000 }            // repete a cada N ms

function proximoAgendamento(opts, de = new Date()) {
  if (!opts) return null;
  const agora = de;
  if (opts.tipo === "intervalo") {
    return agora.getTime() + (opts.ms || 0);
  }
  if (opts.tipo === "diario" || opts.tipo === "semanal") {
    const [h, m] = String(opts.hora || "00:00").split(":").map(Number);
    const alvo = new Date(agora);
    alvo.setHours(h || 0, m || 0, 0, 0);
    if (opts.tipo === "semanal") {
      const diaAlvo = ((opts.dia % 7) + 7) % 7;
      let diasPara = (diaAlvo - agora.getDay() + 7) % 7;
      if (diasPara === 0 && alvo <= agora) diasPara = 7;
      alvo.setDate(alvo.getDate() + diasPara);
    } else if (alvo <= agora) {
      alvo.setDate(alvo.getDate() + 1);
    }
    return alvo.getTime();
  }
  return null;
}

function proximoSemana(dia, hora, de = new Date()) {
  const [h, m] = String(hora || "00:00").split(":").map(Number);
  const alvo = new Date(de);
  alvo.setHours(h || 0, m || 0, 0, 0);
  let diasPara = ((dia - de.getDay()) % 7 + 7) % 7;
  if (diasPara === 0 && alvo <= de) diasPara = 7;
  alvo.setDate(alvo.getDate() + diasPara);
  return alvo.getTime();
}

function proximoDiario(hora, de = new Date()) {
  const [h, m] = String(hora || "00:00").split(":").map(Number);
  const alvo = new Date(de);
  alvo.setHours(h || 0, m || 0, 0, 0);
  if (alvo <= de) alvo.setDate(alvo.getDate() + 1);
  return alvo.getTime();
}

async function avisar(id, discordId, channel, mensagem, recorrencia, item) {
  try {
    await channel.send(`<@${discordId}> ⏰ **Lembrete:** ${mensagem}`);
  } catch (err) {
    log("ERROR", "Erro ao enviar lembrete", { erro: err.message });
  }
  if (recorrencia) {
    const proximo = proximoAgendamento(recorrencia);
    if (proximo) {
      const delay = Math.max(0, proximo - Date.now());
      const timeout = setTimeout(async () => {
        try {
          await avisar(id, discordId, channel, mensagem, recorrencia, item);
        } catch (err) {
          log("ERROR", "Erro ao disparar lembrete recorrente", { erro: err.message });
        }
      }, delay);
      item.timeout = timeout;
      item.restanteMs = delay;
      item.disparos = (item.disparos || 0) + 1;
      log("INFO", "Lembrete recorrente reagendado", { id, disparos: item.disparos, proximo: new Date(proximo).toISOString() });
    }
  } else {
    lembretes.delete(id);
  }
}

async function criarLembrete(discordId, channel, delayMs, mensagem) {
  const id = ++idCounter;
  const item = { timeout: null, mensagem, restanteMs: delayMs, disparos: 0 };
  const timeout = setTimeout(async () => {
    try {
      await avisar(id, discordId, channel, mensagem, null, item);
    } catch (err) {
      log("ERROR", "Erro ao enviar lembrete", { erro: err.message });
      lembretes.delete(id);
    }
  }, delayMs);
  item.timeout = timeout;
  lembretes.set(id, item);
  log("INFO", "Lembrete criado", { id, discordId, delayMs, mensagem: mensagem.slice(0, 50) });
  return id;
}

// Lembretes com repetição automática.
async function criarLembreteRecorrente(discordId, channel, recorrencia, mensagem) {
  const id = ++idCounter;
  const proximo = proximoAgendamento(recorrencia);
  if (!proximo) throw new Error("Recorrência inválida");
  const delayMs = Math.max(0, proximo - Date.now());
  const item = { timeout: null, mensagem, restanteMs: delayMs, disparos: 0 };
  const timeout = setTimeout(async () => {
    try {
      await avisar(id, discordId, channel, mensagem, recorrencia, item);
    } catch (err) {
      log("ERROR", "Erro ao enviar lembrete recorrente", { erro: err.message });
    }
  }, delayMs);
  item.timeout = timeout;
  lembretes.set(id, item);
  log("INFO", "Lembrete recorrente criado", { id, discordId, recorrencia, proximo: new Date(proximo).toISOString(), mensagem: mensagem.slice(0, 50) });
  return id;
}

// Interpreta uma frase como recorrência. Retorna null se não for uma.
// Aceita: "todo dia às 08:00", "diariamente às 07:30", "toda segunda às 07:30",
// "todas as segundas", "a cada 3 horas", "cada 2 dias", "6 horas em 6 horas".
const DIAS_SEMANA = {
  domingo: 0, dom: 0, domingo: 0,
  segunda: 1, segunda_feira: 1, seg: 1, segundas: 1,
  terca: 2, terça: 2, terca_feira: 2, terça_feira: 2, ter: 2, tercas: 2, terças: 2,
  quarta: 3, quarta_feira: 3, qua: 3, quartas: 3,
  quinta: 4, quinta_feira: 4, qui: 4, quintas: 4,
  sexta: 5, sexta_feira: 5, sex: 5, sextas: 5,
  sabado: 6, sábado: 6, sab: 6, sabados: 6, sábados: 6,
};

function interpretarRecorrencia(texto) {
  let t = String(texto || "").trim();
  if (!t) return null;
  // tolera prefixo "me lembra"/"lembra" (sem tirar o sentido)
  t = t.replace(/^(?:me\s+)?(?:lembra|lembrar|le)\s+(?:de|pra|para|em)?\s*/i, "").trim();

  // diário: "todo dia às 08:00" / "diariamente às 07:30"
  let m = t.match(/^(?:todo\s*dia|diariamente|todos\s*os\s*dias)(?:\s+(?:às|as|aos)\s+(\d{1,2}):(\d{2}))?/i);
  if (m) {
    const hora = m[1] && m[2] ? `${m[1].padStart(2, "0")}:${m[2]}` : "08:00";
    return { tipo: "diario", hora };
  }

  // semanal: "toda segunda às 07:30" / "todas as segundas às 08:00" / "na segunda às 7:30"
  m = t.match(/^(?:tod[ao]s?\s+(?:as\s+)?)?(segunda|segunda_feira|terca|terça|terca_feira|terça_feira|quarta|quarta_feira|quinta|quinta_feira|sexta|sexta_feira|sabado|sábado|domingo|segundas|tercas|terças|quartas|quintas|sextas|sabados|sábados|domingos)(?:\s+(?:às|as)\s+(\d{1,2}):(\d{2}))?/i);
  if (m) {
    const dia = DIAS_SEMANA[m[1].toLowerCase()];
    if (dia !== undefined) {
      const hora = m[2] && m[3] ? `${m[2].padStart(2, "0")}:${m[3]}` : "08:00";
      return { tipo: "semanal", dia, hora };
    }
  }

  // intervalo: "a cada 3 horas" / "cada 2 dias" / "a cada 30 minutos"
  m = t.match(/^(?:a\s+)?cada\s+(\d+(?:[.,]\d+)?)\s*(minutos?|min|horas?|h|dias?|d|semanas?)/i);
  if (m) {
    const valor = Number(m[1].replace(",", "."));
    const unidade = m[2].toLowerCase();
    const fatores = { min: 60000, minutos: 60000, h: 3600000, horas: 3600000, d: 86400000, dias: 86400000, semanas: 604800000 };
    const ms = Math.round(valor * (fatores[unidade] || 3600000));
    return { tipo: "intervalo", ms };
  }

  return null;
}

function cancelarLembrete(id) {
  const item = lembretes.get(id);
  if (!item) return false;
  clearTimeout(item.timeout);
  lembretes.delete(id);
  return true;
}

function listarLembretes() {
  return Array.from(lembretes.entries()).map(([id, item]) => ({
    id,
    mensagem: item.mensagem,
    restanteMs: item.restanteMs,
    disparos: item.disparos || 0,
  }));
}

module.exports = { criarLembrete, criarLembreteRecorrente, cancelarLembrete, listarLembretes, interpretarRecorrencia, proximoAgendamento };