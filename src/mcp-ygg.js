const readline = require("readline");
const fs = require("fs");
const path = require("path");

// carrega o .env SEM imprimir nada no stdout (banner quebraria o protocolo MCP)
try {
  const linhas = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split(/\r?\n/);
  for (const linha of linhas) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {}

const BASE = `http://${process.env.API_HOST || "127.0.0.1"}:${process.env.API_PORT || 3000}`;
const CAB = {
  "Content-Type": "application/json",
  "X-Hud-Key": process.env.MASTER_KEY || "",
};

async function chamar(rota, metodo = "GET", corpo) {
  const r = await fetch(BASE + rota, {
    method: metodo,
    headers: CAB,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 300)}`);
  try {
    return JSON.parse(texto);
  } catch {
    return { bruto: texto.slice(0, 500) };
  }
}

const FERRAMENTAS = [
  {
    name: "ygg_painel",
    description: "Status do PC via YGG/HUD: CPU, RAM, disco, bateria.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ygg_falar",
    description: "Conversa com a Neon (IA) pelo HUD e retorna a resposta dela.",
    inputSchema: {
      type: "object",
      properties: { mensagem: { type: "string" } },
      required: ["mensagem"],
    },
  },
  {
    name: "ygg_terminal",
    description: "Executa um comando PowerShell no PC atraves do terminal do YGG/HUD.",
    inputSchema: {
      type: "object",
      properties: { comando: { type: "string" } },
      required: ["comando"],
    },
  },
  {
    name: "ygg_screenshot",
    description: "Tira screenshot da tela do PC via YGG e retorna o caminho/caminho da imagem.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ygg_tela",
    description: "Captura o frame atual da tela ao vivo do YGG (base64/jpeg).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ygg_notificar",
    description: "Envia uma notificacao Windows pelo YGG.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        mensagem: { type: "string" },
      },
      required: ["mensagem"],
    },
  },
  {
    name: "ygg_volume",
    description: "Define o volume do sistema (0-100).",
    inputSchema: {
      type: "object",
      properties: { nivel: { type: "number" } },
      required: ["nivel"],
    },
  },
  {
    name: "ygg_arquivos",
    description: "Lista arquivos/pastas de um diretorio pelo explorador do YGG.",
    inputSchema: {
      type: "object",
      properties: { dir: { type: "string", description: "Caminho da pasta (padrao C:\\)" } },
    },
  },
  {
    name: "ygg_ler_arquivo",
    description: "Le o conteudo de um arquivo pelo explorador do YGG.",
    inputSchema: {
      type: "object",
      properties: { caminho: { type: "string" } },
      required: ["caminho"],
    },
  },
  {
    name: "ygg_salvar_arquivo",
    description: "Salva conteudo em um arquivo pelo explorador do YGG.",
    inputSchema: {
      type: "object",
      properties: {
        caminho: { type: "string" },
        conteudo: { type: "string" },
      },
      required: ["caminho", "conteudo"],
    },
  },
  {
    name: "ygg_acao",
    description: "Acoes rapidas do PC: dormir, bloquear, desligar.",
    inputSchema: {
      type: "object",
      properties: { acao: { type: "string", enum: ["dormir", "bloquear", "desligar"] } },
      required: ["acao"],
    },
  },
  {
    name: "ygg_opencode",
    description: "Manda uma tarefa pro opencode que roda no servidor NEONWORLD.",
    inputSchema: {
      type: "object",
      properties: { tarefa: { type: "string" } },
      required: ["tarefa"],
    },
  },
  {
    name: "ygg_modo",
    description: "Le o estado da Neon. Ela nao tem modos — e sempre uma so (neon).",
    inputSchema: { type: "object", properties: {} },
  },
];

function responder(id, resultado) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: resultado }) + "\n");
}

function erro(id, mensagem) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: mensagem } }) + "\n");
}

async function chamarFerramenta(nome, args) {
  let dados;
  switch (nome) {
    case "ygg_painel":
      dados = await chamar("/api/pc");
      break;
    case "ygg_falar":
      dados = await chamar("/api/chat", "POST", {
        mensagem: args.mensagem,
        usuario: "OpenCode",
        userId: "mcp_ygg",
      });
      break;
    case "ygg_terminal":
      dados = await chamar("/api/terminal", "POST", { comando: args.comando });
      break;
    case "ygg_screenshot":
      dados = await chamar("/api/pc/screenshot", "POST", {});
      break;
    case "ygg_tela":
      dados = await chamar("/api/pc/tela");
      break;
    case "ygg_notificar":
      dados = await chamar("/api/pc/notificar", "POST", {
        titulo: args.titulo || "Neon",
        mensagem: args.mensagem,
      });
      break;
    case "ygg_volume":
      dados = await chamar("/api/pc/volume", "POST", { nivel: args.nivel });
      break;
    case "ygg_arquivos":
      dados = await chamar(args.dir ? `/api/arquivos?dir=${encodeURIComponent(args.dir)}` : "/api/arquivos");
      break;
    case "ygg_ler_arquivo":
      dados = await chamar(`/api/arquivos/conteudo?path=${encodeURIComponent(args.caminho)}`);
      break;
    case "ygg_salvar_arquivo":
      dados = await chamar("/api/arquivos/salvar", "POST", {
        caminho: args.caminho,
        conteudo: args.conteudo,
      });
      break;
    case "ygg_acao":
      dados = await chamar("/api/pc/acao", "POST", { acao: args.acao });
      break;
    case "ygg_opencode":
      dados = await chamar("/api/opencode", "POST", { tarefa: args.tarefa });
      break;
    case "ygg_modo":
      dados = await chamar("/api/modo");
      break;
    default:
      throw new Error(`ferramenta desconhecida: ${nome}`);
  }
  return { content: [{ type: "text", text: JSON.stringify(dados) }] };
}

const rl = readline.createInterface({ input: process.stdin });

rl.on("line", async (linha) => {
  let msg;
  try {
    msg = JSON.parse(linha);
  } catch {
    return;
  }

  if (msg.method === "initialize") {
    responder(msg.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "neon-ygg", version: "1.0.0" },
    });
    return;
  }

  if (msg.method === "notifications/initialized") return;

  if (msg.method === "tools/list") {
    responder(msg.id, { tools: FERRAMENTAS });
    return;
  }

  if (msg.method === "tools/call") {
    try {
      const resultado = await chamarFerramenta(msg.params?.name, msg.params?.arguments || {});
      responder(msg.id, resultado);
    } catch (err) {
      erro(msg.id, err.message);
    }
    return;
  }
});
