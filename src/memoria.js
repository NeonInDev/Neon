const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

const ARQUIVO = path.join(__dirname, "..", "memoria_global.json");

function carregar() {
  try {
    if (fs.existsSync(ARQUIVO)) return JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
  } catch {}
  return { memorias: [] };
}

function salvar(data) {
  fs.writeFileSync(ARQUIVO, JSON.stringify(data, null, 2), "utf8");
}

async function lembrar(chave, valor) {
  const data = carregar();
  const existente = data.memorias.findIndex(m => m.chave.toLowerCase() === chave.toLowerCase());
  if (existente >= 0) {
    data.memorias[existente].valor = valor;
    data.memorias[existente].atualizada = new Date().toISOString();
  } else {
    data.memorias.push({ chave, valor, criada: new Date().toISOString(), atualizada: new Date().toISOString() });
  }
  salvar(data);
  log("INFO", "[MEMORIA] Lembrei", { chave, valor: valor.slice(0, 60) });
  return `✅ Lembrei: "${chave}" = "${valor}"`;
}

async function esquecer(chave) {
  const data = carregar();
  const initial = data.memorias.length;
  data.memorias = data.memorias.filter(m => m.chave.toLowerCase() !== chave.toLowerCase());
  if (data.memorias.length === initial) return `❌ Não lembro de nada sobre "${chave}".`;
  salvar(data);
  return `🗑️ Esqueci "${chave}".`;
}

async function buscar(texto) {
  const data = carregar();
  const termo = texto.toLowerCase();
  const resultados = data.memorias.filter(m =>
    m.chave.toLowerCase().includes(termo) || m.valor.toLowerCase().includes(termo)
  );
  return resultados.slice(0, 10);
}

async function listar() {
  const data = carregar();
  return data.memorias;
}

function formatarParaPrompt() {
  const data = carregar();
  if (!data.memorias.length) return "";
  const linhas = data.memorias.map(m => `- ${m.chave}: ${m.valor.slice(0, 200)}`);
  return "Memorias que voce tem sobre o mundo e o dono:\n" + linhas.join("\n");
}

module.exports = { lembrar, esquecer, buscar, listar, formatarParaPrompt };
