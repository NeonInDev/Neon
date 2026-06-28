const mcp = require("./mcp");
const mcpPC = require("./mcp-servers/mcp-pc");
const mcpBrowser = require("./mcp-servers/mcp-browser");
const mcpSystem = require("./mcp-servers/mcp-system");
const mcpBridge = require("./mcp-servers/mcp-bridge");

mcp.registrar(mcpPC);
mcp.registrar(mcpBrowser);
mcp.registrar(mcpSystem);
mcp.registrar(mcpBridge);

let connected = false;
let requestId = 0;
const pendentes = new Map();

function escrever(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function getTools() {
  return mcp.getSchemaFerramentas();
}

let buffer = "";
process.stdin.on("data", (data) => {
  buffer += data.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed);
      processarMensagem(msg);
    } catch (err) {
      if (requestId > 0) {
        escrever({
          jsonrpc: "2.0",
          id: requestId,
          error: { code: -32700, message: "Parse error" },
        });
      }
    }
  }
});

async function processarMensagem(msg) {
  const { id, method, params } = msg;

  if (method === "initialize") {
    connected = true;
    escrever({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "0.1",
        capabilities: {
          tools: {},
          resources: {},
        },
        serverInfo: { name: "Neon", version: "3.0.0" },
      },
    });
    return;
  }

  if (method === "notifications/initialized") {
    return;
  }

  if (method === "tools/list") {
    escrever({
      jsonrpc: "2.0",
      id,
      result: { tools: getTools() },
    });
    return;
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params || {};
    if (!name) {
      escrever({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "Tool name required" },
      });
      return;
    }

    const argStr = args
      ? typeof args === "object"
        ? Object.values(args).join(" | ")
        : String(args)
      : "";

    try {
      const resultado = await mcp.executar(name, argStr);
      const isErro =
        resultado.startsWith("❌") || resultado.startsWith("⚠️");
      escrever({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: typeof resultado === "string" ? resultado : JSON.stringify(resultado),
            },
          ],
          isError: isErro,
        },
      });
    } catch (err) {
      escrever({
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: err.message },
      });
    }
    return;
  }

  if (method === "resources/list") {
    escrever({
      jsonrpc: "2.0",
      id,
      result: { resources: [] },
    });
    return;
  }

  escrever({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
}

process.stdin.on("end", () => {
  mcp.pararTodos();
  process.exit(0);
});

process.on("SIGINT", () => {
  mcp.pararTodos();
  process.exit(0);
});

process.on("SIGTERM", () => {
  mcp.pararTodos();
  process.exit(0);
});
