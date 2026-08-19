const http = require("http");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { log } = require("./logger");
const { askNeon } = require("./ai");
const { MASTER_KEY } = require("./config");
const { db } = require("./db");

const SSL_DIR = path.join(__dirname, "..", "ssl");
const SSL_PFX = path.join(SSL_DIR, "neon.pfx");
const SSL_PASS = process.env.SSL_PASS;
const SSL_PORT = parseInt(process.env.SSL_PORT, 10) || 3443;
const API_HOST = process.env.API_HOST || "127.0.0.1";

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
};

let server = null;

const ORIGENS_PERMITIDAS = [
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^http:\/\/([0-9a-f:]{2,}(:\d+)?|\[[0-9a-f:]{2,}\]:\d+)$/,
  /^https:\/\/([0-9a-f:]{2,}(:\d+)?|\[[0-9a-f:]{2,}\]:\d+)$/,
  /^http:\/\/100\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https:\/\/100\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
];

const OPENCODE_USER = process.env.OPENCODE_SERVER_USERNAME || "opencode";
const OPENCODE_PASS = process.env.OPENCODE_SERVER_PASSWORD || SSL_PASS || "";

function temChave(req) {
  const chave = req.headers["x-hud-key"];
  if (typeof chave !== "string") return false;

  const recebida = Buffer.from(chave);
  const esperada = Buffer.from(MASTER_KEY);
  return recebida.length === esperada.length && crypto.timingSafeEqual(recebida, esperada);
}

function temBasicAuth(req) {
  const auth = req.headers.authorization;
  if (typeof auth !== "string" || !auth.startsWith("Basic ")) return false;
  let decoded;
  try {
    decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  const u = Buffer.from(user);
  const p = Buffer.from(pass);
  const ue = Buffer.from(OPENCODE_USER);
  const pe = Buffer.from(OPENCODE_PASS);
  if (u.length !== ue.length || p.length !== pe.length) return false;
  return crypto.timingSafeEqual(u, ue) && crypto.timingSafeEqual(p, pe);
}

function exigeChave(req, res) {
  if (!temChave(req) && !temBasicAuth(req)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Neon"');
    responder(res, 401, { erro: "chave inválida" });
    return false;
  }
  return true;
}

function responder(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function lerBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch (err) { reject(new Error("JSON inválido")); }
    });
    req.on("error", reject);
  });
}

function lerBodyBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let excedeu = false;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (maxBytes && total > maxBytes) {
        excedeu = true;
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(excedeu ? null : Buffer.concat(chunks)));
    req.on("error", () => resolve(null));
  });
}

function servirArquivo(url, res) {
  let caminho;
  if (url === "/" || url === "/dashboard" || url === "/hud") caminho = path.join(PUBLIC_DIR, "hud", "index.html");
  else if (url === "/manifest.json") caminho = path.join(PUBLIC_DIR, "manifest.json");
  else if (url === "/sw.js") caminho = path.join(PUBLIC_DIR, "sw.js");
  else if (url === "/gesture" || url === "/gesture.html") caminho = path.join(PUBLIC_DIR, "gesture.html");
  else if (url.startsWith("/public/")) caminho = path.join(PUBLIC_DIR, url.slice("/public/".length));
  else return false;

  const base = path.resolve(PUBLIC_DIR).toLowerCase();
  const resolved = path.resolve(caminho).toLowerCase();
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    res.writeHead(403); res.end("forbidden"); return true;
  }
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found"); return true;
  }
  const ext = path.extname(resolved).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(resolved).pipe(res);
  return true;
}

function iniciar(port = 3000) {
  if (server) return server;

  const handler = async (req, res) => {
    const origin = req.headers.origin;
    if (origin && ORIGENS_PERMITIDAS.some((re) => re.test(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Hud-Key");
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && servirArquivo(req.url, res)) return;

    if (req.url === "/health" && req.method === "GET") {
      responder(res, 200, { healthy: true, version: "2.0.0" });
      return;
    }

    if (req.url === "/global/health" && req.method === "GET") {
      responder(res, 200, { healthy: true, version: "2.0.0" });
      return;
    }

    if (req.url === "/doc" && req.method === "GET") {
      const spec = {
        openapi: "3.1.0",
        info: { title: "Neon Server", version: "2.0.0" },
        servers: [{ url: "/" }],
        paths: {
          "/health": { get: { responses: { "200": { description: "ok" } } } },
          "/session/{id}/message": {
            post: {
              parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
              requestBody: { content: { "application/json": { schema: { type: "object" } } } },
              responses: { "200": { description: "resposta da Neon" } },
            },
          },
          "/api/chat": {
            post: {
              requestBody: { content: { "application/json": { schema: { type: "object" } } } },
              responses: { "200": { description: "resposta da Neon" } },
            },
          },
        },
      };
      responder(res, 200, spec);
      return;
    }

    if (req.url === "/global/event" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      const ping = setInterval(() => {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
      }, 15000);
      res.write(`event: server.connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
      req.on("close", () => clearInterval(ping));
      return;
    }

    const sessaoMsg = req.url.match(/^\/session\/([^/]+)\/message$/);
    if (sessaoMsg && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const { parts, text } = await lerBody(req);
        const mensagem = Array.isArray(parts)
          ? parts.map((p) => (typeof p === "string" ? p : p?.text || "")).join(" ")
          : text;
        if (!mensagem || !String(mensagem).trim()) { responder(res, 400, { erro: "parts/text é obrigatório" }); return; }
        const reply = await askNeon("api_anon", "API", String(mensagem));
        responder(res, 200, {
          info: { id: sessaoMsg[1], role: "assistant" },
          parts: [{ type: "text", text: reply }],
        });
      } catch (err) {
        responder(res, 400, { erro: err.message });
      }
      return;
    }

    if (req.url === "/api/chat" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const { mensagem, usuario, userId } = await lerBody(req);
        if (!mensagem) { responder(res, 400, { erro: "mensagem é obrigatória" }); return; }
        const reply = await askNeon(userId || "api_anon", usuario || "Anônimo", mensagem);
        responder(res, 200, { resposta: reply });
      } catch (err) {
        responder(res, 400, { erro: err.message });
      }
      return;
    }

    if (req.url === "/api/status" && req.method === "GET") {
      responder(res, 200, { status: "online", versao: "2.0.0" });
      return;
    }

    if (req.url === "/api/shutdown" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      responder(res, 200, { ok: true, mensagem: "Desligando Neon suavemente..." });
      setTimeout(() => process.emit("SIGTERM"), 300);
      return;
    }

    if (req.url === "/api/modo" && req.method === "GET") {
      const { getModo } = require("./modo");
      responder(res, 200, { modo: getModo() });
      return;
    }

    if (req.url === "/api/modo" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const { setModo } = require("./modo");
        const { modo } = await lerBody(req);
        const novo = await setModo(modo);
        responder(res, 200, { ok: true, modo: novo });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/pc" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const pc = require("./pc");
        const [info, bateria] = await Promise.all([
          pc.pcInfoJson().catch(() => null),
          pc.bateriaJson().catch(() => ({ temBateria: false })),
        ]);
        responder(res, 200, { info, bateria });
      } catch (err) {
        responder(res, 500, { erro: err.message });
      }
      return;
    }

    if (req.url === "/api/pc/volume" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const pc = require("./pc");
        const { nivel } = await lerBody(req);
        if (typeof nivel !== "number") { responder(res, 400, { erro: "nivel numérico é obrigatório" }); return; }
        const msg = await pc.volume("set", nivel);
        responder(res, 200, { ok: true, mensagem: msg });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/pc/screenshot" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const pc = require("./pc");
        const b64 = await pc.screenshotBase64();
        responder(res, 200, { ok: true, imagem: `data:image/png;base64,${b64}` });
      } catch (err) { responder(res, 500, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/pc/notificar" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const pc = require("./pc");
        const { titulo, mensagem } = await lerBody(req);
        if (!titulo || !mensagem) { responder(res, 400, { erro: "titulo e mensagem são obrigatórios" }); return; }
        const msg = await pc.notificarToast(titulo, mensagem);
        responder(res, 200, { ok: true, mensagem: msg });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/visao" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const { imagem } = await lerBody(req);
        if (!imagem) { responder(res, 400, { erro: "imagem (base64) é obrigatória" }); return; }
        const pc = require("./pc");
        const resultado = await pc.analisarImagem(imagem);
        responder(res, 200, resultado);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/voz/falar" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const { texto, guildId } = await lerBody(req);
        if (!texto) { responder(res, 400, { erro: "texto é obrigatório" }); return; }
        const voz = require("./voz");
        const alvo = guildId || voz.status()[0]?.guildId;
        if (!alvo) { responder(res, 404, { erro: "nenhum canal de voz ativo" }); return; }
        const ok = await voz.falar(alvo, texto);
        responder(res, ok ? 200 : 500, { ok, guildId: alvo });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/voz/audio" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const { texto, voz } = await lerBody(req);
        if (!texto) { responder(res, 400, { erro: "texto é obrigatório" }); return; }
        const tts = require("./tts");
        const { vozPorModo } = require("./modo");
        const mp3 = await tts.gerarAudio(texto, voz || vozPorModo());
        if (!mp3) { responder(res, 500, { erro: "TTS indisponível" }); return; }
        res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": mp3.length });
        res.end(mp3);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/voz/stt" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const buf = await lerBodyBuffer(req, 25 * 1024 * 1024);
        if (!buf) { responder(res, 413, { erro: "áudio grande demais (máx 25 MB)" }); return; }
        if (buf.length < 200) { responder(res, 400, { erro: "áudio vazio ou curto demais" }); return; }
        const voz = require("./voz");
        const tmp = process.env.TEMP || "C:\\Temp";
        const ts = Date.now();
        const input = path.join(tmp, `neon_stt_in_${ts}.webm`);
        const wav = path.join(tmp, `neon_stt_in_${ts}.wav`);
        fs.writeFileSync(input, buf);
        const ffmpegPath = require("ffmpeg-static");
        const { exec: execCb } = require("child_process");
        const { promisify } = require("util");
        const execAsync = promisify(execCb);
        await execAsync(`"${ffmpegPath}" -y -i "${input}" -ar 16000 -ac 1 -sample_fmt s16 "${wav}"`, { timeout: 30000, windowsHide: true });
        try { fs.unlinkSync(input); } catch {}
        if (!fs.existsSync(wav) || fs.statSync(wav).size < 100) {
          responder(res, 400, { erro: "não consegui converter o áudio" });
          return;
        }
        const texto = await voz.transcreverAudio(wav);
        try { fs.unlinkSync(wav); } catch {}
        if (!texto) { responder(res, 422, { erro: "não consegui entender o áudio" }); return; }
        responder(res, 200, { ok: true, texto });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/terminal" && req.method === "POST") {
      if (!temChave(req)) { responder(res, 401, { erro: "chave inválida" }); return; }
      try {
        const { comando } = await lerBody(req);
        if (!comando) { responder(res, 400, { erro: "comando é obrigatório" }); return; }
        const remoto = require("./remoto");
        const r = await remoto.executarComando(comando);
        responder(res, 200, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/arquivos" && req.method === "GET") {
      if (!temChave(req)) { responder(res, 401, { erro: "chave inválida" }); return; }
      try {
        const remoto = require("./remoto");
        const dir = new URL(req.url, "http://x").searchParams.get("dir") || undefined;
        const lista = await remoto.listarDir(dir);
        responder(res, 200, lista);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/arquivos/conteudo" && req.method === "GET") {
      if (!temChave(req)) { responder(res, 401, { erro: "chave inválida" }); return; }
      try {
        const remoto = require("./remoto");
        const caminho = new URL(req.url, "http://x").searchParams.get("path");
        if (!caminho) { responder(res, 400, { erro: "path é obrigatório" }); return; }
        const r = await remoto.lerArquivo(caminho);
        responder(res, 200, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/arquivos/salvar" && req.method === "POST") {
      if (!temChave(req)) { responder(res, 401, { erro: "chave inválida" }); return; }
      try {
        const remoto = require("./remoto");
        const { caminho, conteudo } = await lerBody(req);
        if (!caminho) { responder(res, 400, { erro: "caminho é obrigatório" }); return; }
        const r = await remoto.salvarArquivo(caminho, conteudo);
        responder(res, 200, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/arquivos/abrir" && req.method === "POST") {
      if (!temChave(req)) { responder(res, 401, { erro: "chave inválida" }); return; }
      try {
        const remoto = require("./remoto");
        const { caminho } = await lerBody(req);
        if (!caminho) { responder(res, 400, { erro: "caminho é obrigatório" }); return; }
        const r = await remoto.abrirArquivo(caminho);
        responder(res, 200, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/pc/acao" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const pc = require("./pc");
        const { acao, nome } = await lerBody(req);
        let resultado;
        switch (acao) {
          case "dormir": resultado = await pc.dormir(); break;
          case "bloquear": resultado = await pc.bloquear(); break;
          case "desligar": resultado = await pc.desligar(); break;
          case "cancelar_desligar": resultado = await pc.cancelarDesligar(); break;
          case "abrir_app": {
            if (!nome) { responder(res, 400, { erro: "nome é obrigatório" }); return; }
            resultado = await pc.abrirAppPorNome(nome);
            break;
          }
          default: responder(res, 400, { erro: "acao desconhecida" }); return;
        }
        responder(res, 200, { ok: true, resultado });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/pc/tela" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const pc = require("./pc");
        const b64 = await pc.screenshotBase64();
        responder(res, 200, { ok: true, imagem: `data:image/png;base64,${b64}` });
      } catch (err) { responder(res, 500, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/historico" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const usuario = new URL(req.url, "http://x").searchParams.get("usuario") || "HUD";
        const hist = (db.data.historico && db.data.historico[usuario]) || [];
        responder(res, 200, { historico: hist });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/historico" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const { usuario, mensagem, resposta } = await lerBody(req);
        if (!usuario) { responder(res, 400, { erro: "usuario é obrigatório" }); return; }
        if (!db.data.historico) db.data.historico = {};
        if (!db.data.historico[usuario]) db.data.historico[usuario] = [];
        db.data.historico[usuario].push({
          t: Date.now(),
          m: String(mensagem || "").slice(0, 2000),
          r: String(resposta || "").slice(0, 4000),
        });
        if (db.data.historico[usuario].length > 200) db.data.historico[usuario] = db.data.historico[usuario].slice(-200);
        await db.write();
        responder(res, 200, { ok: true });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/historico" && req.method === "DELETE") {
      if (!exigeChave(req, res)) return;
      try {
        const usuario = new URL(req.url, "http://x").searchParams.get("usuario") || "HUD";
        if (db.data.historico) db.data.historico[usuario] = [];
        await db.write();
        responder(res, 200, { ok: true });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/braco/status" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const braco = require("./braco");
        responder(res, 200, await braco.status());
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/braco/pose" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const braco = require("./braco");
        const { pose, servos } = await lerBody(req);
        if (pose) { responder(res, 200, await braco.pose(pose)); return; }
        if (Array.isArray(servos)) { responder(res, 200, await braco.enviar("/pose", { servos })); return; }
        responder(res, 400, { erro: "envie { pose } ou { servos }" });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/braco/servo" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const braco = require("./braco");
        const { n, ang } = await lerBody(req);
        if (n == null || ang == null) { responder(res, 400, { erro: "n e ang sao obrigatorios" }); return; }
        responder(res, 200, await braco.servo(n, ang));
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/braco/grip" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const braco = require("./braco");
        const { aberto } = await lerBody(req);
        responder(res, 200, await braco.grip(aberto));
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/gesture" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const pc = require("./pc");
        const { tipo, x, y, botao, delta, tecla, titulo, mensagem, acao, valor } = await lerBody(req);
        switch (tipo) {
          case "mover": {
            const tela = await telaCached();
            const px = Math.max(0, Math.min(1, Number(x) || 0)) * tela.largura;
            const py = Math.max(0, Math.min(1, Number(y) || 0)) * tela.altura;
            enfileirarMover(pc, Math.round(px), Math.round(py));
            responder(res, 200, { ok: true });
            return;
          }
          case "clique": {
            const tela = await telaCached();
            const px = Math.round(Math.max(0, Math.min(1, Number(x) || 0)) * tela.largura);
            const py = Math.round(Math.max(0, Math.min(1, Number(y) || 0)) * tela.altura);
            await pc.clicarMouse(px, py, botao === "right" ? "right" : "left");
            responder(res, 200, { ok: true });
            return;
          }
          case "duplo": {
            const tela = await telaCached();
            const px = Math.round(Math.max(0, Math.min(1, Number(x) || 0)) * tela.largura);
            const py = Math.round(Math.max(0, Math.min(1, Number(y) || 0)) * tela.altura);
            await pc.duploClique(px, py);
            responder(res, 200, { ok: true });
            return;
          }
          case "scroll": {
            await pc.scroll(Number(delta) || 0);
            responder(res, 200, { ok: true });
            return;
          }
          case "arrastar_meio": {
            await pc.arrastarMeio();
            responder(res, 200, { ok: true });
            return;
          }
          case "soltar_meio": {
            await pc.soltarMeio();
            responder(res, 200, { ok: true });
            return;
          }
          case "tecla": {
            if (!tecla) { responder(res, 400, { erro: "tecla é obrigatória" }); return; }
            await pc.tecla(String(tecla));
            responder(res, 200, { ok: true });
            return;
          }
          case "volume": {
            await pc.volume(acao === "down" ? "down" : "up", valor);
            responder(res, 200, { ok: true });
            return;
          }
          case "notificar": {
            if (!titulo || !mensagem) { responder(res, 400, { erro: "titulo e mensagem são obrigatórios" }); return; }
            await pc.notificarToast(String(titulo), String(mensagem));
            responder(res, 200, { ok: true });
            return;
          }
          default:
            responder(res, 400, { erro: "tipo de gesto desconhecido" });
            return;
        }
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/ambiente" && req.method === "GET") {
      const ambiente = process.env.RENDER ? "render" : "pc";
      responder(res, 200, { ambiente, render: !!process.env.RENDER });
      return;
    }

    if (req.url === "/api/opencode" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const { tarefa } = await lerBody(req);
        if (!tarefa || !String(tarefa).trim()) { responder(res, 400, { erro: "tarefa é obrigatória" }); return; }
        const opencode = require("./opencode");
        const resultado = await opencode.executar(String(tarefa).slice(0, 3000));
        responder(res, 200, { ok: true, resultado });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    responder(res, 404, { erro: "rota não encontrada" });
  };

  let telaCache = null;
  let telaCacheTs = 0;
  async function telaCached() {
    if (telaCache && Date.now() - telaCacheTs < 30000) return telaCache;
    const pc = require("./pc");
    telaCache = await pc.tamanhoTela();
    telaCacheTs = Date.now();
    return telaCache;
  }

  let moverPendente = null;
  let moverRodando = false;
  function enfileirarMover(pc, px, py) {
    moverPendente = { px, py };
    if (moverRodando) return;
    moverRodando = true;
    (async () => {
      try {
        while (moverPendente) {
          const alvo = moverPendente;
          moverPendente = null;
          await pc.moverMouse(alvo.px, alvo.py);
        }
      } catch {} finally {
        moverRodando = false;
      }
    })();
  }

  server = http.createServer(handler);

  server.listen(port, API_HOST, () => {
    log("INFO", `[API] Rodando em http://${API_HOST}:${port}`);
  });

  if (fs.existsSync(SSL_PFX) && SSL_PASS) {
    try {
      const ssl = https.createServer(
        { pfx: fs.readFileSync(SSL_PFX), passphrase: SSL_PASS },
        handler
      );
      ssl.listen(SSL_PORT, API_HOST, () => {
        log("INFO", `[API] Segura rodando em https://${API_HOST}:${SSL_PORT}`);
      });
    } catch (err) {
      log("WARN", "[API] Não consegui subir HTTPS", { erro: err.message });
    }
  } else if (fs.existsSync(SSL_PFX)) {
    log("WARN", "[API] HTTPS desativado: defina SSL_PASS no .env");
  }

  return server;
}

function parar() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = { iniciar, parar };
