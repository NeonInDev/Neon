"use strict";

const readline = require("readline");
const { calcularExpressao } = require("./calculadora");

const FERRAMENTAS = [
  {
    name: "neon_status",
    description: "Mostra a versão e o estado básico local da Neon. Não acessa arquivos sensíveis nem a rede.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "neon_calcular",
    description: "Calcula uma expressão aritmética simples usando apenas números, parênteses e + - * / %.",
    inputSchema: {
      type: "object",
      properties: { expressao: { type: "string", description: "Exemplo: (12 + 3) * 2" } },
      required: ["expressao"],
    },
  },
  {
    name: "neon_comandos",
    description: "Lista os comandos públicos e seguros mais úteis da Neon.",
    inputSchema: { type: "object", properties: {} },
  },
];

function responder(id, resultado) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: resultado }) + "\n");
}

function erro(id, mensagem) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: mensagem } }) + "\n");
}

async function chamarFerramenta(nome, args = {}) {
  if (nome === "neon_status") {
    return { content: [{ type: "text", text: JSON.stringify({ online: true, versao: "2.0.0", mcp: "neon-local" }) }] };
  }
  if (nome === "neon_calcular") {
    return { content: [{ type: "text", text: JSON.stringify({ resultado: calcularExpressao(args.expressao) }) }] };
  }
  if (nome === "neon_comandos") {
    return { content: [{ type: "text", text: "Comandos seguros: ajuda, status, clima <cidade>, cotação <moeda>, pesquisa web <tema>, calcular <expressão>, QR code <texto>." }] };
  }
  throw new Error("ferramenta desconhecida");
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (linha) => {
  let msg;
  try { msg = JSON.parse(linha); } catch { return; }
  if (msg.method === "initialize") {
    responder(msg.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "neon-local", version: "1.0.0" } });
  } else if (msg.method === "tools/list") {
    responder(msg.id, { tools: FERRAMENTAS });
  } else if (msg.method === "tools/call") {
    try { responder(msg.id, await chamarFerramenta(msg.params?.name, msg.params?.arguments)); }
    catch (err) { erro(msg.id, err.message); }
  }
});
