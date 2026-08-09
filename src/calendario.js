// Compatibilidade com a integração anterior — delega pro módulo Google.
const { calendar, status } = require("./google");

async function autenticar() {
  return calendar ? require("./google").getClient() : null;
}

async function listarEventos(quantidade = 5) {
  const r = await calendar.listarEventos(quantidade);
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true, eventos: r.eventos };
}

async function eventosHoje() {
  const r = await calendar.eventosHoje();
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true, eventos: r.eventos, total: r.total };
}

async function criarEvento(titulo, dataHoraInicio, dataHoraFim, descricao = "") {
  return calendar.criarEvento(titulo, dataHoraInicio, dataHoraFim, descricao);
}

async function statusCompat() {
  const s = await status();
  return { autenticado: s.autenticado, credentialsExists: s.credentialsExists };
}

module.exports = { autenticar, listarEventos, eventosHoje, criarEvento, status: statusCompat };
