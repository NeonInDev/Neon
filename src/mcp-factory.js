// mcp-factory: permite que a Neon (via seu opencode) conheça os MCPs atuais e
// desenvolva MCPs novos ao longo do tempo, seguindo o mesmo padrão dos
// arquivos src/mcp-*.js (servidor MCP stdio, protocolo JSON-RPC).
//
// Segurança: MCPs novos são GERADOS e REGISTRADOS como `enabled: false`
// (staging) e NUNCA ativados sem aprovação explícita do dono. Código com termos
// proibidos é bloqueado.

const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

const RAIZ = path.join(__dirname, "..");
const OPENCODE_JSON = path.join(RAIZ, "opencode.json");
const SRC = path.join(RAIZ, "src");

const TERMOS_PROIBIDOS =
  /ransomware|keylogger|bypass|exploit|credential.?theft|steal.?password|hack.?account|phishing|ddos|malware|virus.?create|backdoor/i;

function slugSeguro(nome) {
  return String(nome || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
}

function lerConfig() {
  try {
    return JSON.parse(fs.readFileSync(OPENCODE_JSON, "utf8"));
  } catch (err) {
    log("WARN", "[MCP-FACTORY] Falha ao ler opencode.json", { erro: err.message });
    return null;
  }
}

function salvarConfig(config) {
  fs.writeFileSync(OPENCODE_JSON, JSON.stringify(config, null, 2), "utf8");
}

function listarMcps() {
  const config = lerConfig();
  if (!config?.mcp) return [];
  const lista = [];
  for (const [nome, m] of Object.entries(config.mcp)) {
    lista.push({
      nome,
      enabled: m.enabled !== false,
      type: m.type || "unknown",
      command: Array.isArray(m.command) ? m.command.join(" ") : String(m.command || ""),
    });
  }
  return lista;
}

function inventarioEmTexto() {
  const mcps = listarMcps();
  if (!mcps.length) return "Nenhum MCP configurado no opencode.json.";
  return mcps
    .map((m) => `- ${m.nome} (${m.enabled ? "ativo" : "desativado"}): ${m.command}`)
    .join("\n");
}

function registrarMcp(nome, comandoArr, habilitar = false) {
  const config = lerConfig();
  if (!config) throw new Error("Não consegui ler opencode.json");
  if (!config.mcp) config.mcp = {};
  config.mcp[nome] = {
    type: "local",
    command: comandoArr,
    enabled: !!habilitar,
  };
  salvarConfig(config);
  return config.mcp[nome];
}

function ativarMcp(nome) {
  const config = lerConfig();
  if (!config?.mcp?.[nome]) throw new Error(`MCP "${nome}" não está registrado.`);
  config.mcp[nome].enabled = true;
  salvarConfig(config);
  return config.mcp[nome];
}

// Cria o arquivo src/mcp-<nome>.js. Retorna { arquivo, erro? }.
function criarArquivoMcp(nome, codigo) {
  const id = slugSeguro(nome);
  if (!id) throw new Error("Nome de MCP inválido.");
  const codigoTxt = String(codigo || "").trim();
  if (!codigoTxt.includes("module.exports") && !/readline|stdio/i.test(codigoTxt)) {
    throw new Error("O MCP deve seguir o padrão stdio (readline + JSON-RPC) e/ou exportar module.exports.");
  }
  if (TERMOS_PROIBIDOS.test(codigoTxt)) {
    throw new Error("Código contém termos proibidos; MCP bloqueado.");
  }

  fs.mkdirSync(SRC, { recursive: true });
  const arquivo = path.join(SRC, `mcp-${id}.js`);
  fs.writeFileSync(arquivo, codigoTxt, "utf8");
  log("INFO", "[MCP-FACTORY] MCP criado (staging)", { id, arquivo });
  return { id, arquivo, nome };
}

// Fluxo completo usado pela skill: gera o arquivo e registra no opencode.json.
// Retorna detalhes pra Neon decidir se pergunta a aprovação do dono.
function desenvolverMcp(nome, codigo) {
  const { id, arquivo } = criarArquivoMcp(nome, codigo);
  const comando = ["node", `src/mcp-${id}.js`];
  const registrado = registrarMcp(`mcp-${id}`, comando, false);
  return {
    id: `mcp-${id}`,
    arquivo,
    registrado,
    pendenteAprovacao: true,
    instrucao:
      `MCP "${id}" criado em staging (desativado). Para ativar, peça a aprovação do dono e use: ativarMcp("mcp-${id}") após o OK. Depois reinicie o servidor opencode p/ carregar o novo MCP.`,
  };
}

module.exports = {
  listarMcps,
  inventarioEmTexto,
  registrarMcp,
  ativarMcp,
  criarArquivoMcp,
  desenvolverMcp,
  lerConfig,
  salvarConfig,
  REMOVER: null, // place-holder compat
};
