const { log } = require("./logger");
const mcp = require("./mcp");
const mcpPC = require("./mcp-servers/mcp-pc");
const mcpBrowser = require("./mcp-servers/mcp-browser");
const mcpSystem = require("./mcp-servers/mcp-system");
const mcpBridge = require("./mcp-servers/mcp-bridge");

function iniciar() {
  mcp.registrar(mcpPC);
  mcp.registrar(mcpBrowser);
  mcp.registrar(mcpSystem);
  mcp.registrar(mcpBridge);
  log("INFO", "[TOOLS] MCP iniciado com servidores: PC, Browser, System, Bridge");
}

function descricaoFerramentas() {
  return mcp.listarFerramentas();
}

function getFerramentas() {
  return mcp.getFerramentas();
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
  log("INFO", "[TOOLS] Executando ferramenta via MCP", { nome, args: args.slice(0, 100) });

  if (!mcp.isToolLocal(nome)) {
    log("INFO", "[TOOLS] Tool nao encontrada -> bridge fallback", { nome });
    const bridge = require("./bridge");
    const taskId = bridge.pedirOpencode(`${nome}: ${args}`, userId);
    const task = await bridge.aguardarTask(taskId, 300000);
    if (task.status === "done") return task.result || "✅ Feito pelo opencode.";
    return "⏱️ opencode nao respondeu. Tenta de novo?";
  }

  return await mcp.executar(nome, args, userId);
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

module.exports = { iniciar, executarFerramenta, processarResposta, descricaoFerramentas, extrairFerramentas, getFerramentas };
