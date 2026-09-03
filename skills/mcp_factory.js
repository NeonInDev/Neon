// Skill "mcp_factory" — permite que a Neon desenvolva MCPs novos ao longo do
// tempo. Quando o dono pedir uma capacidade que o opencode dela ainda não tem
// (ex.: "cria uma ferramenta pra controlar minhas luzes"), essa skill usa o
// opencode para gerar um servidor MCP novo (padrão src/mcp-*.js), registra no
// opencode.json em staging (desativado) e orienta o passo de ativação sob
// aprovação do dono.

const fs = require("fs");
const path = require("path");
const opencode = require("../plugins/opencode");
const factory = require("../src/mcp-factory");

const PROMPT_BASE = `
Você é um engenheiro de software criando um servidor MCP (Model Context Protocol) em Node.js p/ a Neon.

O MCP DEVE seguir EXATAMENTE o padrão dos arquivos existentes em src/mcp-*.js:
- Usa readline.createInterface({ input: process.stdin }) e process.stdout.write(JSON.stringify({...}) + "\\n").
- Trata os métodos: initialize, notifications/initialized, tools/list, tools/call.
- Em tools/list, responde { tools: [{ name, description, inputSchema }] }.
- Em tools/call, executa e responde o resultado conforme o switch de ferramentas.
- Não imprime NADA no stdout fora do protocolo.
- module.exports NÃO é obrigatório, mas o arquivo precisa ser Node.js válido p/ rodar via "node src/mcp-NOME.js".

REGRAS:
- Use APENAS módulos padrão do Node (fs, path, http, https, child_process) OU já instalados no projeto (axios, cheerio, sharp).
- NÃO use APIs que precisem de chave secreta a menos que o pedido explicite.
- Máximo ~200 linhas. Sem comentários excessivos.
- Retorne SOMENTE o código JavaScript puro, sem markdown, sem \`\`\`.

Pedido do usuário:
`;

async function executar(args) {
  const pedido = String(args || "").slice(0, 1200);
  const t = pedido.trim().toLowerCase();

  // "ativar <id>" — ativa um MCP que passou pela aprovação do dono e reinicia o opencode.
  if (t.startsWith("ativar ")) {
    const id = t.replace(/^ativar\s+/, "").trim().replace(/["'`]/g, "");
    try {
      const ativado = factory.ativarMcp(id);
      await opencode.reiniciar();
      return `✅ MCP "${id}" ativado no opencode.json e servidor opencode reiniciado p/ carregá-lo.`;
    } catch (err) {
      return `❌ ${err.message}`;
    }
  }

  if (!t.trim() || t === "listar" || t === "lista" || t === "inventario") {
    return (
      "Inventário atual de MCPs do opencode da Neon:\n" + factory.inventarioEmTexto()
    );
  }

  const prompt = PROMPT_BASE + "\n\n" + pedido;
  const bruto = await opencode.executar(prompt);
  if (!bruto) return "❌ Não consegui gerar o MCP agora (opencode não respondeu).";

  let codigo = bruto.trim();
  codigo = codigo.replace(/^```(?:javascript|js)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  // Reintegra a "interface" mínima esperada p/ o padrão (caso o modelo só
  // tenha devolvido o handler sem o wrapper).
  let nome = "nova_capacidade";
  const nomeMatch = codigo.match(/name:\s*["'`]([a-z0-9_]+)["'`]/);
  if (nomeMatch) nome = nomeMatch[1];
  const id = String(nome).toLowerCase().replace(/[^a-z0-9]+/g, "_");

  try {
    const resultado = factory.desenvolverMcp(id, codigo);
    return [
      `🧠 **Novo MCP desenvolvido (staging):** ${resultado.id}`,
      `**Arquivo:** ${resultado.arquivo}`,
      `**Registrado em:** opencode.json (desativado, aguardando sua aprovação)`,
      ``,
      `Quando o dono aprovar, ative com: ${resultado.id}`,
    ].join("\n");
  } catch (err) {
    return `❌ ${err.message}`;
  }
}

module.exports = { nome: "mcp_factory", descricao: "Desenvolve e registra MCPs novos para o opencode da Neon.", executar };
