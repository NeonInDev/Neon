const { log } = require("../src/logger");
const { OWNER } = require("../src/perm");
const { vaiChover } = require("../src/clima");
const { enviarDM } = require("../src/discord_msg");

const ATIVO = process.env.ALERTA_CHUVA !== "0";
const HORA = parseInt(process.env.ALERTA_CHUVA_HORA || "7", 10);
const LIMITE = parseInt(process.env.ALERTA_CHUVA_LIMITE || "60", 10);

let timer = null;
let ultimoDiaAlertado = null;

function diaLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function checar() {
  if (!ATIVO) return;
  const agora = new Date();
  if (agora.getHours() < HORA) return;
  const dia = diaLocal();
  if (ultimoDiaAlertado === dia) return;
  try {
    const r = await vaiChover(process.env.CLIMA_CIDADE || "");
    if (!r.ok || !r.dados) {
      log("WARN", "[ALERTA_CHUVA] Sem dados do clima agora", { motivo: r.mensagem || r.erro });
      return;
    }
    const hojeProb = (r.dados.hoje && r.dados.hoje.probChuva) || 0;
    const amanhaProb = (r.dados.amanha && r.dados.amanha.probChuva) || 0;
    if (hojeProb < LIMITE && amanhaProb < LIMITE) {
      ultimoDiaAlertado = dia;
      log("INFO", "[ALERTA_CHUVA] Sem chuva relevante hoje", { hoje: hojeProb, amanha: amanhaProb });
      return;
    }
    let msg = `☔ **ALERTA DE CHUVA** — ${r.dados.cidade}\n`;
    msg += `Hoje (${r.dados.hoje.condicao}): ${hojeProb}% de chance`;
    if ((r.dados.horasChuva || []).length) {
      msg += `\n⏰ Pior horário: ${r.dados.horasChuva.map((h) => `${h.hora}h`).join(", ")}`;
    }
    msg += `\nAmanhã: ${amanhaProb}%`;
    if (hojeProb >= LIMITE) msg += `\n\n🚌 Sai com guarda-chuva e olho no relógio!`;
    const sent = await enviarDM(OWNER, msg);
    if (sent && sent.ok) {
      ultimoDiaAlertado = dia;
      log("INFO", "[ALERTA_CHUVA] Alerta enviado pro dono", { hoje: hojeProb, amanha: amanhaProb });
    } else {
      log("WARN", "[ALERTA_CHUVA] Falhou ao mandar DM", { resp: JSON.stringify(sent).slice(0, 200) });
    }
  } catch (err) {
    log("WARN", "[ALERTA_CHUVA] Erro na checagem", { erro: err.message });
  }
}

module.exports = {
  nome: "alerta_chuva",
  versao: "1.0.0",
  desc: "Uma vez por dia, a partir da hora configurada, avisa o dono por DM se a chance de chuva (hoje ou amanhã) passar do limite.",
  checar,
  async iniciar() {
    if (!ATIVO) {
      log("INFO", "[ALERTA_CHUVA] Desativado via env");
      return;
    }
    timer = setInterval(checar, 15 * 60 * 1000);
    setTimeout(checar, 2 * 60 * 1000);
    log("INFO", "[ALERTA_CHUVA] Ativo", { horaInicial: HORA, limitePct: LIMITE });
  },
  async parar() {
    if (timer) clearInterval(timer);
  },
};
