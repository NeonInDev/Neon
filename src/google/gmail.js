const { novaConexao, isAuthenticated } = require("./auth");
const { log } = require("../logger");

function gmail() {
  if (!isAuthenticated()) return null;
  return novaConexao("gmail", "v1");
}

async function detalhes(msg) {
  const headers = {};
  for (const h of msg.payload?.headers || []) {
    headers[h.name?.toLowerCase()] = h.value;
  }
  return {
    id: msg.id,
    de: headers.from || "?",
    para: headers.to || "",
    assunto: headers.subject || "(sem assunto)",
    data: headers.date || "",
    trecho: (msg.snippet || "").slice(0, 160),
  };
}

async function naoLidos() {
  const g = gmail();
  if (!g) return { ok: false, erro: "Google nao autenticado" };
  try {
    const res = await g.users.messages.list({ userId: "me", q: "is:unread", maxResults: 25 });
    const ids = res.data.messages || [];
    return { ok: true, total: res.data.resultSizeEstimate, ids: ids.map((m) => m.id) };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

async function listar(quantidade = 5, query = "") {
  const g = gmail();
  if (!g) return { ok: false, erro: "Google nao autenticado" };
  try {
    const res = await g.users.messages.list({ userId: "me", q: query || "in:inbox", maxResults: quantidade });
    const msgs = [];
    for (const m of res.data.messages || []) {
      const det = await g.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["From", "Subject", "Date", "To"] });
      msgs.push(await detalhes(det.data));
    }
    return { ok: true, emails: msgs, total: res.data.resultSizeEstimate };
  } catch (err) {
    log("WARN", "[GOOGLE:GMAIL] Erro ao listar", { erro: err.message });
    return { ok: false, erro: err.message };
  }
}

async function buscar(query) {
  const g = gmail();
  if (!g) return { ok: false, erro: "Google nao autenticado" };
  try {
    const res = await g.users.messages.list({ userId: "me", q: query, maxResults: 5 });
    const msgs = [];
    for (const m of res.data.messages || []) {
      const det = await g.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["From", "Subject", "Date"] });
      msgs.push(await detalhes(det.data));
    }
    return { ok: true, emails: msgs };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

module.exports = { naoLidos, listar, buscar };
