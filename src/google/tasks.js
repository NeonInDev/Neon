const { novaConexao, isAuthenticated } = require("./auth");
const { log } = require("../logger");

function tasks() {
  if (!isAuthenticated()) return null;
  return novaConexao("tasks", "v1");
}

async function listaDefault() {
  const t = tasks();
  if (!t) return null;
  const res = await t.tasklists.list({ maxResults: 10 });
  const listas = res.data.items || [];
  const principal = listas.find((l) => l.title === "My Tasks") || listas[0];
  return principal || null;
}

async function listar() {
  const t = tasks();
  if (!t) return { ok: false, erro: "Google nao autenticado" };
  try {
    const lista = await listaDefault();
    if (!lista) return { ok: true, tarefas: [] };
    const res = await t.tasks.list({ tasklist: lista.id, showCompleted: false, maxResults: 50 });
    const tarefas = (res.data.items || []).map((x) => ({
      id: x.id,
      titulo: x.title,
      status: x.status,
      vencimento: x.due || "",
      link: x.webViewLink || "",
    }));
    return { ok: true, tarefas, lista: lista.title };
  } catch (err) {
    log("WARN", "[GOOGLE:TASKS] Erro ao listar", { erro: err.message });
    return { ok: false, erro: err.message };
  }
}

async function criar(titulo, due = "") {
  const t = tasks();
  if (!t) return { ok: false, erro: "Google nao autenticado" };
  try {
    const lista = await listaDefault();
    if (!lista) return { ok: false, erro: "Nenhuma lista de tarefas encontrada" };
    const resource = { title: titulo, status: "needsAction" };
    if (due) resource.due = new Date(due).toISOString();
    const res = await t.tasks.insert({ tasklist: lista.id, resource });
    return { ok: true, id: res.data.id, titulo: res.data.title, lista: lista.title };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

async function concluir(tituloOuId) {
  const t = tasks();
  if (!t) return { ok: false, erro: "Google nao autenticado" };
  try {
    const lista = await listaDefault();
    if (!lista) return { ok: false, erro: "Nenhuma lista de tarefas encontrada" };
    const res = await t.tasks.list({ tasklist: lista.id, showCompleted: false, maxResults: 100 });
    const items = res.data.items || [];
    const alvo = items.find((x) => x.id === tituloOuId) || items.find((x) => x.title.toLowerCase().includes(String(tituloOuId).toLowerCase()));
    if (!alvo) return { ok: false, erro: "Tarefa nao encontrada (por id ou nome)" };
    await t.tasks.update({ tasklist: lista.id, task: alvo.id, resource: { ...alvo, status: "completed", completed: new Date().toISOString() } });
    return { ok: true, concluida: true, titulo: alvo.title };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

module.exports = { listar, criar, concluir };
