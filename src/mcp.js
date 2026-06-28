const { log } = require("./logger");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const EventEmitter = require("events");

const servidores = [];
const servidoresExternos = [];
const toolMap = new Map();
const CONFIG_PATH = path.join(__dirname, "..", "mcp-config.json");
let requestId = 1000;
let healthInterval = null;

function registrar(server) {
  if (!server.nome || !server.tools || !server.handleCall) {
    throw new Error(`MCP server invalido: ${server.nome || "sem nome"}`);
  }
  servidores.push(server);
  for (const tool of server.tools) {
    toolMap.set(tool.nome, { tipo: "interno", server, tool });
  }
  log("INFO", `[MCP] Servidor interno registrado: ${server.nome} (${server.tools.length} tools)`);
}

// ===== Transporte STDIO (MCP sobre child_process) =====

class StioTransport extends EventEmitter {
  constructor(nome, comando, args = []) {
    super();
    this.nome = nome;
    this.comando = comando;
    this.args = args;
    this.processo = null;
    this.buffer = "";
    this.pendentes = new Map();
    this.tools = [];
    this.connected = false;
    this.reconnectTimer = null;
  }

  _parseArgs(cmdStr) {
    const args = [];
    let current = "";
    let inQuote = false;
    let quoteChar = null;
    for (let i = 0; i < cmdStr.length; i++) {
      const ch = cmdStr[i];
      if (inQuote) {
        if (ch === quoteChar) { inQuote = false; continue; }
        current += ch;
      } else if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === " ") {
        if (current) { args.push(current); current = ""; }
      } else {
        current += ch;
      }
    }
    if (current) args.push(current);
    return args;
  }

  async conectar() {
    const argsParseados = this._parseArgs(this.comando);
    const [cmd, ...cmdArgs] = argsParseados.length > 0 ? argsParseados : [this.comando];
    const finalArgs = [...cmdArgs, ...this.args];

    this.processo = spawn(cmd, finalArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.processo.stdout.on("data", (data) => this._processarDados(data));
    this.processo.stderr.on("data", (data) => {
      const msg = data.toString().trim();
      if (msg) log("DEBUG", `[MCP:${this.nome}] stderr: ${msg}`);
    });
    this.processo.on("error", (err) => {
      log("ERROR", `[MCP:${this.nome}] Erro no processo`, { erro: err.message });
      this._desconectar();
    });
    this.processo.on("exit", (code, signal) => {
      log("WARN", `[MCP:${this.nome}] Processo encerrado`, { code, signal });
      this._desconectar();
      this._reagendarReconnect();
    });

    await this._handshake();
  }

  async _handshake() {
    const initResult = await this._enviarRequest("initialize", {
      protocolVersion: "0.1",
      capabilities: {},
      clientInfo: { name: "Neon", version: "1.0.0" },
    });

    if (!initResult) {
      throw new Error(`Falha na inicializacao do servidor MCP: ${this.nome}`);
    }

    await this._enviarNotification("notifications/initialized");

    const toolsResult = await this._enviarRequest("tools/list", {});
    if (toolsResult?.tools) {
      this.tools = toolsResult.tools.map((t) => {
        const props = t.inputSchema?.properties || {};
        const required = t.inputSchema?.required || [];
        const formato = required.length > 0
          ? required.map((k) => `[${k}]`).join(" | ")
          : Object.keys(props).map((k) => `[${k}]`).join(" | ");
        return {
          nome: t.name,
          desc: t.description || "",
          formato,
          schema: t.inputSchema,
          serverName: this.nome,
        };
      });
      log("INFO", `[MCP] Servidor externo conectado: ${this.nome} (${this.tools.length} tools)`);
    }

    this.connected = true;

    for (const tool of this.tools) {
      toolMap.set(tool.nome, { tipo: "externo", server: this, tool });
    }
  }

  _processarDados(data) {
    this.buffer += data.toString();
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        this._processarMensagem(msg);
      } catch (err) {
        log("WARN", `[MCP:${this.nome}] JSON invalido: ${trimmed.slice(0, 200)}`);
      }
    }
  }

  _processarMensagem(msg) {
    if (msg.id && this.pendentes.has(msg.id)) {
      const { resolve, timeout } = this.pendentes.get(msg.id);
      clearTimeout(timeout);
      this.pendentes.delete(msg.id);
      if (msg.error) {
        resolve(null);
        log("WARN", `[MCP:${this.nome}] Erro na request ${msg.id}`, { erro: msg.error });
      } else {
        resolve(msg.result || null);
      }
    }
  }

  _enviarRequest(method, params = {}) {
    return new Promise((resolve) => {
      const id = ++requestId;
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      const timeout = setTimeout(() => {
        this.pendentes.delete(id);
        resolve(null);
        log("WARN", `[MCP:${this.nome}] Timeout na request ${method} (${id})`);
      }, 30000);
      this.pendentes.set(id, { resolve, timeout });
      try {
        this.processo.stdin.write(msg);
      } catch (err) {
        clearTimeout(timeout);
        this.pendentes.delete(id);
        resolve(null);
      }
    });
  }

  _enviarNotification(method, params = {}) {
    const msg = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
    try {
      this.processo.stdin.write(msg);
    } catch {}
  }

  _montarArgs(args, tool) {
    if (!tool?.schema?.properties) {
      return typeof args === "string" ? { input: args } : args;
    }

    const props = tool.schema.properties;
    const propNames = Object.keys(props);
    const required = tool.schema.required || [];

    if (propNames.length === 0) return {};

    const strArgs = typeof args === "string" ? args : String(args);
    const partes = strArgs.includes("|") ? strArgs.split("|").map((s) => s.trim()).filter(Boolean) : [strArgs];

    if (propNames.length === 1) {
      const key = propNames[0];
      return { [key]: this._valorTipado(key, partes[0] || strArgs, props) };
    }

    if (required.length === 1 && partes.length >= 1) {
      return { [required[0]]: this._valorTipado(required[0], partes.join(" | "), props) };
    }

    const obj = {};

    if (partes.length === 1 && required.length >= 2) {
      const precisamDePath = required.includes("path") && required.includes("pattern");
      if (precisamDePath) {
        obj.path = ".";
        obj.pattern = this._valorTipado("pattern", partes[0], props);
        return obj;
      }
      const precisamDeQuery = required.includes("query") && required.includes("limit");
      if (precisamDeQuery) {
        obj.query = this._valorTipado("query", partes[0], props);
        return obj;
      }
    }

    for (let i = 0; i < partes.length && i < propNames.length; i++) {
      const key = propNames[i];
      if (partes[i]) obj[key] = this._valorTipado(key, partes[i], props);
    }
    for (const key of required) {
      if (obj[key] === undefined && props[key]?.default !== undefined) {
        obj[key] = props[key].default;
      }
    }
    return obj;
  }

  _valorTipado(key, value, props) {
    if (value === undefined || value === null) return value;
    const schemaType = props[key]?.type;
    if (schemaType === "array") { try { return JSON.parse(value); } catch { return [value]; } }
    if (schemaType === "number" || schemaType === "integer") { const n = Number(value); return isNaN(n) ? value : n; }
    if (schemaType === "boolean") return value === "true" || value === "1";
    return value;
  }

  async executar(nome, args) {
    const tool = this.tools.find((t) => t.nome === nome);
    const argObj = this._montarArgs(args, tool);

    const result = await this._enviarRequest("tools/call", {
      name: nome,
      arguments: argObj,
    });

    if (!result) return `❌ Servidor MCP "${this.nome}" não respondeu para ${nome}.`;
    if (result.isError) return `❌ ${result.content?.[0]?.text || "Erro no servidor MCP"}`;
    const text = result.content?.map((c) => c.text || "").join("\n").trim();
    return text || "✅ Executado via MCP externo.";
  }

  _desconectar() {
    this.connected = false;
    for (const [id, { resolve, timeout }] of this.pendentes) {
      clearTimeout(timeout);
      resolve(null);
    }
    this.pendentes.clear();

    for (const tool of this.tools) {
      toolMap.delete(tool.nome);
    }
    this.tools = [];
  }

  _reagendarReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      log("INFO", `[MCP:${this.nome}] Tentando reconectar...`);
      try {
        await this.conectar();
        log("INFO", `[MCP:${this.nome}] Reconectado com sucesso`);
      } catch (err) {
        log("WARN", `[MCP:${this.nome}] Falha ao reconectar: ${err.message}`);
        this._reagendarReconnect();
      }
    }, 10000);
  }

  desconectar() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._desconectar();
    if (this.processo) {
      this.processo.kill();
      this.processo = null;
    }
  }
}

// ===== Ciclo de vida dos servidores externos =====

function carregarConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    }
  } catch (err) {
    log("WARN", "[MCP] Erro ao ler config", { erro: err.message });
  }
  return { servidores: [] };
}

async function conectarStdio(nome, comando, argsExtras = []) {
  const transport = new StioTransport(nome, comando, argsExtras);
  servidoresExternos.push(transport);
  log("INFO", `[MCP] Conectando servidor externo: ${nome} (${comando})`);
  try {
    await transport.conectar();
    log("INFO", `[MCP] Servidor externo conectado: ${nome}`);
  } catch (err) {
    log("WARN", `[MCP] Falha ao conectar servidor externo: ${nome}`, { erro: err.message });
  }
  return transport;
}

async function iniciarServidoresExternos() {
  const config = carregarConfig();
  for (const entry of config.servidores) {
    if (entry.enabled === false) continue;
    await conectarStdio(entry.nome, entry.comando, entry.args || []);
  }

  healthInterval = setInterval(() => {
    for (const s of servidoresExternos) {
      if (!s.connected && s.processo) {
        s._desconectar();
        s._reagendarReconnect();
      }
    }
  }, 30000);
}

function pararTodos() {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
  for (const s of servidoresExternos) {
    s.desconectar();
  }
  servidoresExternos.length = 0;
}

// ===== API comum (in-process + externo) =====

function listarFerramentas() {
  const lista = [];
  for (const { tool } of toolMap.values()) {
    let desc = tool.desc;
    if (tool.formato) desc += `. Uso: ${tool.formato}`;
    lista.push(`- ${tool.nome}: ${desc}`);
  }
  return lista.join("\n");
}

function getFerramentas() {
  return Array.from(toolMap.values()).map(({ tool }) => ({
    nome: tool.nome,
    desc: tool.desc + (tool.formato ? `. Uso: ${tool.formato}` : ""),
  }));
}

function getSchemaFerramentas() {
  return Array.from(toolMap.values()).map(({ tool }) => ({
    name: tool.nome,
    description: tool.desc,
    inputSchema: {
      type: "object",
      properties: tool.schema?.properties || {},
      required: tool.schema?.required || [],
    },
  }));
}

async function executar(nome, args, userId = null) {
  const entry = toolMap.get(nome);
  if (!entry) {
    log("WARN", `[MCP] Tool nao encontrada: ${nome}`);
    return `❌ Ferramenta "${nome}" não encontrada.`;
  }

  log("INFO", `[MCP] Executando ${entry.tipo}::${nome}`, { args: String(args).slice(0, 100) });

  try {
    if (entry.tipo === "interno") {
      return await entry.server.handleCall(nome, args, userId);
    }
    return await entry.server.executar(nome, args);
  } catch (err) {
    log("ERROR", `[MCP] Erro em ${nome}`, { erro: err.message });
    return `❌ Erro ao executar ${nome}: ${err.message}`;
  }
}

function getToolNames() {
  return Array.from(toolMap.keys());
}

function isToolLocal(nome) {
  return toolMap.has(nome);
}

function getServidoresInfo() {
  const info = [];
  for (const s of servidores) {
    const tools = s.tools.map((t) => t.nome);
    info.push({ nome: s.nome, tipo: "interno", tools });
  }
  for (const s of servidoresExternos) {
    const tools = s.tools.map((t) => t.nome);
    info.push({ nome: s.nome, tipo: "externo", conectado: s.connected, comando: s.comando, tools });
  }
  return info;
}

module.exports = {
  registrar,
  conectarStdio,
  iniciarServidoresExternos,
  pararTodos,
  listarFerramentas,
  getFerramentas,
  getSchemaFerramentas,
  executar,
  getToolNames,
  isToolLocal,
  getServidoresInfo,
  carregarConfig,
};
