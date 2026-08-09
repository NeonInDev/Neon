const { log } = require("./logger");
const opencode = require("./opencode");

function descricaoFerramentas() {
  return `- codar: Delega QUALQUER tarefa ao opencode. Usa navegador, PC, codigo, pesquisa, arquivo, TUDO. Uso: codar | [descricao detalhada do que fazer]`;
}

function extrairFerramentas(texto) {
  const linhas = texto.split("\n");
  const ferramentas = [];
  for (const linha of linhas) {
    const m = linha.trim().match(/^[*_]{0,2}FERRAMENTA:[*_]{0,2}\s*(\w+)\s*(?:\|\s*(.*))?$/i);
    if (m) ferramentas.push({ nome: m[1].toLowerCase(), args: (m[2] || "").trim() });
  }
  return ferramentas;
}

async function executarFerramenta(ferramenta, userId = null) {
  const { nome, args } = ferramenta;
  log("INFO", "[TOOLS] Delegando pro opencode", { nome, args: args?.slice(0, 100) });

  const resultado = await opencode.executar(args);
  return resultado || "❌ OpenCode não respondeu.";
}

async function processarResposta(texto, userId = null) {
  const ferramentas = extrairFerramentas(texto);
  if (!ferramentas.length) return { texto, acoes: [] };
  const resultados = [];
  for (const f of ferramentas) {
    const res = await executarFerramenta(f, userId);
    resultados.push({ ferramenta: f, resultado: res });
  }
  return { texto, acoes: resultados };
}

function iniciar() {
  log("INFO", "[TOOLS] Tudo delegado ao opencode serve");
  opencode.iniciarServer().catch(() => {});
}

module.exports = { iniciar, executarFerramenta, processarResposta, descricaoFerramentas, extrairFerramentas };
