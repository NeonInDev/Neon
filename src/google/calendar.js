const { novaConexao, isAuthenticated } = require("./auth");
const { log } = require("../logger");

function calendar() {
  if (!isAuthenticated()) return null;
  return novaConexao("calendar", "v3");
}

async function listarEventos(quantidade = 5) {
  const c = calendar();
  if (!c) return { ok: false, erro: "Google nao autenticado" };
  try {
    const res = await c.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults: quantidade,
      singleEvents: true,
      orderBy: "startTime",
    });
    const eventos = (res.data.items || []).map((e) => ({
      id: e.id,
      titulo: e.summary,
      inicio: e.start?.dateTime || e.start?.date || "N/A",
      fim: e.end?.dateTime || e.end?.date || "N/A",
      descricao: e.description?.slice(0, 200) || "",
      local: e.location || "",
      link: e.htmlLink || "",
    }));
    return { ok: true, eventos };
  } catch (err) {
    log("WARN", "[GOOGLE:CALENDAR] Erro ao listar", { erro: err.message });
    return { ok: false, erro: err.message };
  }
}

async function eventosHoje() {
  const c = calendar();
  if (!c) return { ok: false, erro: "Google nao autenticado" };
  try {
    const agora = new Date();
    const fimDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59);
    const res = await c.events.list({
      calendarId: "primary",
      timeMin: agora.toISOString(),
      timeMax: fimDoDia.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });
    const eventos = (res.data.items || []).map((e) => ({
      id: e.id,
      titulo: e.summary,
      inicio: e.start?.dateTime || e.start?.date || "N/A",
      local: e.location || "",
    }));
    return { ok: true, eventos, total: eventos.length };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

async function listarSemana() {
  const c = calendar();
  if (!c) return { ok: false, erro: "Google nao autenticado" };
  try {
    const fim = new Date();
    fim.setDate(fim.getDate() + 7);
    const res = await c.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      timeMax: fim.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 25,
    });
    const eventos = (res.data.items || []).map((e) => ({
      id: e.id,
      titulo: e.summary,
      inicio: e.start?.dateTime || e.start?.date || "N/A",
      local: e.location || "",
    }));
    return { ok: true, eventos };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

async function criarEvento(titulo, dataHoraInicio, dataHoraFim, descricao = "") {
  const c = calendar();
  if (!c) return { ok: false, erro: "Google nao autenticado" };
  try {
    const resource = {
      summary: titulo,
      description: descricao,
      start: { dateTime: new Date(dataHoraInicio).toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: new Date(dataHoraFim).toISOString(), timeZone: "America/Sao_Paulo" },
    };
    if (/^\d{4}-\d{2}-\d{2}$/.test(dataHoraInicio)) {
      resource.start = { date: dataHoraInicio };
      resource.end = { date: dataHoraFim || dataHoraInicio };
    }
    const evento = await c.events.insert({ calendarId: "primary", resource });
    return { ok: true, id: evento.data.id, link: evento.data.htmlLink, titulo: evento.data.summary };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

async function excluirEvento(nomeOuId) {
  const c = calendar();
  if (!c) return { ok: false, erro: "Google nao autenticado" };
  try {
    let eventId = nomeOuId;
    if (!/^[a-zA-Z0-9_]+$/.test(nomeOuId) || nomeOuId.length > 64) {
      const fim = new Date();
      fim.setDate(fim.getDate() + 60);
      const res = await c.events.list({
        calendarId: "primary",
        timeMin: new Date().toISOString(),
        timeMax: fim.toISOString(),
        singleEvents: true,
        maxResults: 50,
      });
      const alvo = (res.data.items || []).find((e) =>
        String(e.summary || "").toLowerCase().includes(String(nomeOuId).toLowerCase())
      );
      if (!alvo) return { ok: true, excluido: false };
      eventId = alvo.id;
      await c.events.delete({ calendarId: "primary", eventId });
      return { ok: true, excluido: true, titulo: alvo.summary };
    }
    await c.events.delete({ calendarId: "primary", eventId });
    return { ok: true, excluido: true, titulo: nomeOuId };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

module.exports = { listarEventos, eventosHoje, listarSemana, criarEvento, excluirEvento };
