const readline = require("readline");

const API_PORT = parseInt(process.env.API_PORT, 10) || 3000;
const BASE = `http://127.0.0.1:${API_PORT}`;

const FERRAMENTAS = [
  {
    name: "falar",
    description: "Faz a Neon falar no canal de voz ativo do Discord (TTS). Passa o texto que ela deve falar.",
    inputSchema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Texto que a Neon deve falar em voz alta" },
        guildId: { type: "string", description: "Opcional. ID do servidor do Discord. Se omitido, usa o canal ativo." },
      },
      required: ["texto"],
    },
  },
  {
    name: "status_voz",
    description: "Lista os canais de voz ativos da Neon (guildId, estado, conversa).",
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
  if (nome === "falar") {
    const resp = await fetch(`${BASE}/api/voz/falar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: String(args.texto || ""), guildId: args.guildId }),
    });
    const data = await resp.json().catch(() => ({}));
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  }
  if (nome === "status_voz") {
    const resp = await fetch(`${BASE}/api/status`);
    const online = resp.ok;
    return { content: [{ type: "text", text: JSON.stringify({ online }) }] };
  }
  throw new Error(`ferramenta desconhecida: ${nome}`);
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
      serverInfo: { name: "neon-voz", version: "1.0.0" },
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
