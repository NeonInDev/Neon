// NeonWatch — bridge entre o relógio (ESP32) e a Neon.
// O relógio é um cliente leve: recebe mensagens e dispara ações.
// Persistência simples em JSON (como memoria_global), apta ao relógio.

const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

const ARQUIVO = path.join(__dirname, "..", "watch.json");
const MAX_NA_FILA = 40;

let store = null;
function carregar() {
  if (store) return store;
  try {
    store = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
  } catch {
    store = { dispositivo: null, fila: [], ids: 0 };
  }
  return store;
}
function salvar() {
  try { fs.writeFileSync(ARQUIVO, JSON.stringify(store, null, 2), "utf8"); } catch (e) { log("WARN", "[WATCH] nao salvou", { erro: e.message }); }
}

// Registra(s) o apelido do dispositivo (o "device id" usado de <token>).
function registrarDispositivo(nome) {
  const s = carregar();
  s.dispositivo = nome || s.dispositivo || "relogio-neon";
  salvar();
  return { ok: true, dispositivo: s.dispositivo };
}
function dispositivo() {
  return carregar().dispositivo || "relogio-neon";
}

// Adiciona uma mensagem pra aparecer no pulso. Chamada pela Neon (DM/comando).
function adicionarMensagem(texto, de = "neon", importancia = "normal") {
  const s = carregar();
  s.ids += 1;
  const m = { id: "w_" + s.ids, de, texto: String(texto), importancia, ts: Math.floor(Date.now() / 1000), lida: false };
  s.fila.unshift(m);
  if (s.fila.length > MAX_NA_FILA) s.fila = s.fila.slice(0, MAX_NA_FILA);
  salvar();
  log("INFO", `[WATCH] mensagem na fila do relogio (${m.id})`);
  return { ok: true, mensagem: m };
}

// O relógio busca as mensagens pendentes (GET /api/watch/mensagens).
function listarParaRelogio() {
  return carregar().fila.filter((m) => !m.lida);
}
function marcarLida(id) {
  const s = carregar();
  const m = s.fila.find((x) => x.id === String(id));
  if (m) m.lida = true;
  salvar();
  return { ok: true };
}
function limparPendentes() {
  const s = carregar();
  s.fila = s.fila.map((m) => ({ ...m, lida: true }));
  salvar();
  return { ok: true, limpas: s.fila.length - s.fila.length }; // sempre 0 após ler; mantém registros
}

// Quando o relógio tocar num botão de ação. Por ora reconhece ações conhecidas
// e responde ok; as ações realmente tocam no PC (impressora, braço, etc.) aqui.
async function executarAcao(acao, parametros = {}) {
  const nome = String(acao || "");
  log("INFO", `[WATCH] acao do relogio: ${nome}`);
  if (nome === "ping") return { ok: true, resposta: "pong" };
  if (nome === "horario") {
    return { ok: true, resposta: new Date().toISOString() };
  }
  // Ações conhecidas que a Neon já sabe executar via actions.js:
  //  - abrir_projeto (parametros.nome)
  //  - clima (parametros.cidade)
  //  - testes dedicados da impressora/braco entram aqui depois.
  if (nome === "abrir_projeto") {
    const projetos = require("./projetos_arquivos");
    const r = projetos.resolver(String(parametros.nome || ""));
    return r ? { ok: true, acao: "abrir", caminho: r.caminho, tipo: r.tipo } : { ok: false, erro: "projeto nao encontrado" };
  }
  return { ok: true, acao: nome, recebido: true, parametros };
}

module.exports = {
  registrarDispositivo, dispositivo,
  adicionarMensagem, listarParaRelogio, marcarLida, limparPendentes,
  executarAcao,
};