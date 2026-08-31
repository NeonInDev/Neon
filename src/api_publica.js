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
const API_HOST = process.env.API_HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");

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
  ".stl": "model/stl",
  ".blend": "application/octet-stream",
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
  if (typeof chave === "string") {
    const recebida = Buffer.from(chave);
    const esperada = Buffer.from(MASTER_KEY);
    if (recebida.length === esperada.length && crypto.timingSafeEqual(recebida, esperada)) return true;
  }
  const qKey = new URL(req.url, "http://x").searchParams.get("key");
  if (typeof qKey === "string" && qKey.length > 0) {
    const recebida = Buffer.from(qKey);
    const esperada = Buffer.from(MASTER_KEY);
    if (recebida.length === esperada.length && crypto.timingSafeEqual(recebida, esperada)) return true;
  }
  return false;
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

function servirArquivo(urlComQuery, res) {
  const url = urlComQuery.split("?")[0];
  let caminho;
  if (url === "/" || url === "/dashboard" || url === "/hud") caminho = path.join(PUBLIC_DIR, "hud", "index.html");
  else if (url === "/manifest.json") caminho = path.join(PUBLIC_DIR, "manifest.json");
  else if (url === "/sw.js") caminho = path.join(PUBLIC_DIR, "sw.js");
  else if (url === "/gesture" || url === "/gesture.html") caminho = path.join(PUBLIC_DIR, "gesture.html");
  else if (url.startsWith("/public/")) caminho = path.join(PUBLIC_DIR, url.slice("/public/".length));
  else if (url === "/whatsapp" || url === "/whatsapp.html") {
    caminho = path.join(PUBLIC_DIR, "whatsapp.html");
    let conteudo = "";
    try { conteudo = fs.readFileSync(caminho, "utf8"); } catch { return false; }
    const qKey = new URL(url, "http://x").searchParams.get("key") || "";
    const chaveSessao = qKey || MASTER_KEY || "";
    conteudo = conteudo.replace("__CHAVE__", chaveSessao);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(conteudo);
    return true;
  }
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

    // Serve um arquivo STL arbitrário do sistema p/ o viewer 3D (HOLOMAT)
    if (req.url.startsWith("/api/stl") && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      const u = new URL(req.url, "http://x");
      let caminho = u.searchParams.get("path") || "";
      try { caminho = decodeURIComponent(caminho); } catch {}
      if (!caminho) { responder(res, 400, { erro: "?path= é obrigatório" }); return; }
      if (!/\.(stl|STL)$/.test(caminho)) { responder(res, 400, { erro: "só aceito arquivos .stl" }); return; }
      const abs = path.resolve(caminho);
      if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { responder(res, 404, { erro: "arquivo não encontrado" }); return; }
      res.writeHead(200, { "Content-Type": "model/stl", "Content-Disposition": `inline; filename="${path.basename(abs)}"` });
      fs.createReadStream(abs).pipe(res);
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

    // desliga o processo do bot de forma limpa (usado pelo YGG pra reiniciar a Neon)
    if (req.url === "/api/bot/parar" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      responder(res, 200, { ok: true, tchau: true });
      log("INFO", "[BOOT] Desligamento solicitado via API (YGG)");
      setTimeout(() => process.exit(0), 400);
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
          case "segurar": {
            await pc.segurarBotao(botao === "right" ? "right" : "left");
            responder(res, 200, { ok: true });
            return;
          }
          case "soltar": {
            await pc.soltarBotao(botao === "right" ? "right" : "left");
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
        const opencode = require("../plugins/opencode");
        const resultado = await opencode.executar(String(tarefa).slice(0, 3000));
        responder(res, 200, { ok: true, resultado });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/objetivo" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const objetivo = require("../objetivo");
        responder(res, 200, { ok: true, ativo: objetivo.objetivoAtivo() });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/objetivo" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const objetivo = require("../objetivo");
        const ativo = await objetivo.setObjetivo(corpo.ativo === true || corpo.ativo === "true");
        responder(res, 200, { ok: true, ativo });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/objetivo/executar" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const { objetivo: texto } = await lerBody(req);
        if (!texto || !String(texto).trim()) { responder(res, 400, { erro: "objetivo é obrigatório" }); return; }
        const objetivo = require("../objetivo");
        const resultado = await objetivo.executarObjetivo("API", "API", String(texto).slice(0, 3000));
        responder(res, 200, { ok: true, resultado });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/qr" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const whatsapp = require("../plugins/whatsapp");
        const buf = await whatsapp.qrPng();
        if (!buf) { responder(res, 404, { erro: "QR indisponível" }); return; }
        res.writeHead(200, { "Content-Type": "image/png", "Content-Length": buf.length, "Cache-Control": "no-store" });
        res.end(buf);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/status" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const whatsapp = require("../plugins/whatsapp");
        responder(res, 200, { ok: true, ...whatsapp.status() });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/enviar" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const whatsapp = require("../plugins/whatsapp");
        const { numero, mensagem } = await lerBody(req);
        if (!numero || !mensagem) { responder(res, 400, { erro: "numero e mensagem são obrigatórios" }); return; }
        const r = await whatsapp.enviar(String(numero), String(mensagem));
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/grupos" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const whatsapp = require("../plugins/whatsapp");
        const r = await whatsapp.listarGrupos();
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/debug" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const whatsapp = require("../plugins/whatsapp");
        const r = await whatsapp.debugPagina();
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/fechar_modais" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const whatsapp = require("../plugins/whatsapp");
        const r = await whatsapp.fecharModais();
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/entrar_grupo" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const whatsapp = require("../plugins/whatsapp");
        const r = await whatsapp.entrarGrupo(corpo && corpo.link ? corpo.link : "");
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/abrir_conversa" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const whatsapp = require("../plugins/whatsapp");
        const r = await whatsapp.abrirConversa(corpo && corpo.termo ? corpo.termo : "");
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/enviar_doc_ui" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const whatsapp = require("../plugins/whatsapp");
        const r = await whatsapp.enviarDocUI(
          corpo && corpo.arquivo ? corpo.arquivo : "",
          corpo && corpo.legenda ? corpo.legenda : ""
        );
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/enviar_ui" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const whatsapp = require("../plugins/whatsapp");
        const r = await whatsapp.enviarUI(corpo && corpo.texto ? corpo.texto : "");
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/enviar_raw" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const whatsapp = require("../plugins/whatsapp");
        const r = await whatsapp.enviarRaw(corpo && corpo.destino ? corpo.destino : "", corpo && corpo.texto ? corpo.texto : "");
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/info_chat" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const whatsapp = require("../plugins/whatsapp");
        const r = await whatsapp.infoChat(corpo && corpo.id ? corpo.id : "");
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/diag_fiber" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const whatsapp = require("../plugins/whatsapp");
        const r = await whatsapp.diagFiber(corpo && corpo.termo ? corpo.termo : "");
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/extrair_ids" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const whatsapp = require("../plugins/whatsapp");
        const corpo = await lerBody(req);
        const r = await whatsapp.extrairIds(corpo && typeof corpo.escopo === "string" ? corpo.escopo : "");
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/clicar_texto" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const whatsapp = require("../plugins/whatsapp");
        const r = await whatsapp.clicarTexto(corpo && corpo.termo ? corpo.termo : "");
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/inspecionar" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const whatsapp = require("../plugins/whatsapp");
        const r = await whatsapp.inspecionar(corpo && corpo.termo ? corpo.termo : "");
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/buscar_chat" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const whatsapp = require("../plugins/whatsapp");
        const r = await whatsapp.buscarChat(corpo && corpo.nome ? corpo.nome : "");
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/grupos_conhecidos" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const whatsapp = require("../plugins/whatsapp");
        responder(res, 200, whatsapp.gruposConhecidos());
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/discord/enviar" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const discordMsg = require("./discord_msg");
        const r = await discordMsg.enviarDM(
          corpo && corpo.usuario ? String(corpo.usuario) : "",
          corpo && corpo.mensagem != null ? String(corpo.mensagem) : ""
        );
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/clima" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const qs = new URLSearchParams(req.url.split("?")[1] || "");
        const { clima: buscarClima } = require("./clima");
        const r = await buscarClima(qs.get("cidade") || "");
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/clima/chuva" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const qs = new URLSearchParams(req.url.split("?")[1] || "");
        const { vaiChover } = require("./clima");
        const r = await vaiChover(qs.get("cidade") || "");
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/boletim" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const b = require("./boletim");
        const r = b.boletimCompleto();
        responder(res, 200, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/boletim/nota" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const b = require("./boletim");
        const r = b.adicionarNota(
          corpo && corpo.materia ? String(corpo.materia) : "",
          corpo && corpo.valor != null ? String(corpo.valor) : "",
          corpo && corpo.bimestre != null ? String(corpo.bimestre) : "",
          corpo && corpo.descricao ? String(corpo.descricao) : ""
        );
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/boletim/meta" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const b = require("./boletim");
        const r = b.definirMeta(corpo && corpo.valor != null ? String(corpo.valor) : "");
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/flashcards/decks" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const fc = require("./flashcards");
        const r = fc.listarDecks();
        responder(res, 200, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/flashcards/deck" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const fc = require("./flashcards");
        const r = fc.criarDeck(corpo && corpo.nome ? String(corpo.nome) : "");
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/flashcards/carta" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const fc = require("./flashcards");
        const r = fc.adicionarCarta(
          corpo && corpo.deck ? String(corpo.deck) : "",
          corpo && corpo.frente ? String(corpo.frente) : "",
          corpo && corpo.verso ? String(corpo.verso) : ""
        );
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/flashcards/estudar" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const fc = require("./flashcards");
        const r = fc.iniciarEstudo(
          corpo && corpo.usuario ? String(corpo.usuario) : "",
          corpo && corpo.deck ? String(corpo.deck) : ""
        );
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/flashcards/avaliar" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const fc = require("./flashcards");
        const r = fc.avaliar(
          corpo && corpo.usuario ? String(corpo.usuario) : "",
          !!(corpo && corpo.acertou)
        );
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/discord/contatos" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const discordMsg = require("./discord_msg");
        const r = await discordMsg.listarContatos();
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    // ── LEITURA (temporária): canais de texto de um servidor + capas ──
    if (req.url.split("?")[0] === "/api/discord/canais" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const qs = new URL(req.url, "http://x").searchParams;
        const servidor = qs.get("servidor") || "";
        const { client } = require("./client");
        if (!client.isReady()) { responder(res, 400, { erro: "Discord ainda não conectou" }); return; }
        const guilds = [];
        for (const g of client.guilds.cache.values()) {
          if (servidor && g.name.toLowerCase() !== String(servidor).toLowerCase()) continue;
          await g.channels.fetch().catch(() => {});
          const tipoNome = { 0: "texto", 2: "voz", 13: "stage", 15: "forum", 4: "categoria", 5: "anuncio", 10: "noticia", 14: "midia" };
          const canais = g.channels.cache
            .filter((c) => !c.isThread())
            .map((c) => ({ id: c.id, nome: c.name, tipo: tipoNome[c.type] || String(c.type), parent: c.parent ? c.parent.name : null }))
            .sort((a, b) => (a.parent || "").localeCompare(b.parent || "") || a.nome.localeCompare(b.nome));
          guilds.push({ id: g.id, nome: g.name, canais });
        }
        responder(res, 200, { ok: true, guilds });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/discord/canal/mensagens" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const qs = new URL(req.url, "http://x").searchParams;
        const id = qs.get("id") || "";
        const limite = parseInt(qs.get("limite") || "5", 10);
        const antes = qs.get("antes") || undefined;
        const { client } = require("./client");
        if (!client.isReady()) { responder(res, 400, { erro: "Discord ainda não conectou" }); return; }
        const ch = await client.channels.fetch(id).catch(() => null);
        if (!ch || !ch.isTextBased()) { responder(res, 404, { erro: "canal não encontrado" }); return; }
        const msgs = await ch.messages.fetch({ limit: Math.min(limite, 100), before: antes, cache: false }).catch(() => null);
        const lista = msgs ? msgs.map((m) => ({
          id: m.id, autor: m.author.username, bot: m.author.bot,
          conteudo: m.content.slice(0, 2500), fixada: m.pinned,
          anexos: m.attachments.size ? m.attachments.map((a) => a.url) : [],
        })) : [];
        responder(res, 200, { ok: true, canal: ch.name, mensagens: lista });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    // ── RENOMEAR (temporária): canal por id ──
    if (req.url.split("?")[0] === "/api/discord/canal/renomear" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const { id, nome } = await lerBody(req);
        if (!id || !nome) { responder(res, 400, { erro: "id e nome são obrigatórios" }); return; }
        const { client } = require("./client");
        if (!client.isReady()) { responder(res, 400, { erro: "Discord ainda não conectou" }); return; }
        const ch = await client.channels.fetch(String(id)).catch(() => null);
        if (!ch) { responder(res, 404, { erro: "canal não encontrado" }); return; }
        const antigo = ch.name;
        const novo = await ch.setName(String(nome));
        responder(res, 200, { ok: true, antes: antigo, depois: novo.name });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    // ── APAGAR (temporária): última mensagem do bot em um canal ──
    if (req.url.split("?")[0] === "/api/discord/canal/apagar_ultima_bot" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const { id } = await lerBody(req);
        if (!id) { responder(res, 400, { erro: "id é obrigatório" }); return; }
        const { client } = require("./client");
        if (!client.isReady()) { responder(res, 400, { erro: "Discord ainda não conectou" }); return; }
        const ch = await client.channels.fetch(String(id)).catch(() => null);
        if (!ch || !ch.isTextBased()) { responder(res, 404, { erro: "canal não encontrado" }); return; }
        const msgs = await ch.messages.fetch({ limit: 10, cache: false }).catch(() => null);
        if (!msgs) { responder(res, 404, { erro: "sem mensagens" }); return; }
        const alvo = msgs.find((m) => m.author && m.author.id === client.user.id);
        if (!alvo) { responder(res, 404, { erro: "sem mensagem do bot" }); return; }
        await alvo.delete().catch(() => null);
        responder(res, 200, { ok: true, apagada: alvo.content.slice(0, 80) });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    // ── APAGAR (temporária): mensagens por ids ──
    if (req.url.split("?")[0] === "/api/discord/canal/apagar_ids" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const { id, ids } = await lerBody(req);
        if (!id || !Array.isArray(ids) || !ids.length) { responder(res, 400, { erro: "id e ids são obrigatórios" }); return; }
        const { client } = require("./client");
        if (!client.isReady()) { responder(res, 400, { erro: "Discord ainda não conectou" }); return; }
        const ch = await client.channels.fetch(String(id)).catch(() => null);
        if (!ch || !ch.isTextBased()) { responder(res, 404, { erro: "canal não encontrado" }); return; }
        let apagadas = 0, erros = [];
        for (let i = 0; i < ids.length; i += 20) {
          const lote = ids.slice(i, i + 20);
          const msgs = await Promise.all(lote.map((mid) => ch.messages.fetch(String(mid)).catch(() => null)));
          const val = msgs.filter(Boolean);
          const feitas = await ch.bulkDelete(val, true).catch(() => null);
          if (feitas && feitas.size > 0) {
            apagadas += feitas.size;
            await new Promise((r) => setTimeout(r, 350));
            continue;
          }
          for (const m of val) {
            const ok = await m.delete().catch(() => false);
            if (ok) apagadas++;
            await new Promise((r) => setTimeout(r, 350));
          }
        }
        responder(res, 200, { ok: true, apagadas });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    // ── LIMPAR (temporária): apaga TODAS as mensagens do bot em um canal ──
    if (req.url.split("?")[0] === "/api/discord/canal/limpar_bot" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const { id } = await lerBody(req);
        if (!id) { responder(res, 400, { erro: "id é obrigatório" }); return; }
        const { client } = require("./client");
        if (!client.isReady()) { responder(res, 400, { erro: "Discord ainda não conectou" }); return; }
        const ch = await client.channels.fetch(String(id)).catch(() => null);
        if (!ch || !ch.isTextBased()) { responder(res, 404, { erro: "canal não encontrado" }); return; }
        let apagadas = 0, fim = false, semProgresso = 0;
        while (!fim) {
          const msgs = await ch.messages.fetch({ limit: 100, cache: false }).catch(() => null);
          if (!msgs || msgs.size === 0) break;
          const botMsgs = msgs.filter((m) => m.author && m.author.id === client.user.id && m.deletable);
          if (botMsgs.size === 0) { fim = true; break; }
          const tentativa = botMsgs.size;
          const ok = await ch.bulkDelete(botMsgs, true).catch(() => {
            try { return ch.bulkDelete(botMsgs, false); } catch { return null; }
          });
          const removidas = ok ? (Array.isArray(ok) ? ok.length : ok.size) : 0;
          if (removidas > 0) { apagadas += removidas; semProgresso = 0; }
          else semProgresso++;
          if (semProgresso >= 2) { fim = true; break; }
          await new Promise((r) => setTimeout(r, 300));
        }
        responder(res, 200, { ok: true, apagadas });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/discord/enviar_canal" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const corpo = await lerBody(req);
        const discordMsg = require("./discord_msg");
        const r = await discordMsg.enviarCanal(
          corpo && corpo.servidor ? String(corpo.servidor) : "",
          corpo && corpo.canal ? String(corpo.canal) : "",
          corpo && corpo.mensagem != null ? String(corpo.mensagem) : "",
          Array.isArray(corpo && corpo.arquivos) ? corpo.arquivos : []
        );
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/discord/quirks/sumario" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const { client } = require("./client");
        if (!client.isReady()) { responder(res, 400, { erro: "Discord ainda não conectou" }); return; }
        const qe = require("./quirks_envio");
        const corpo = await lerBody(req);
        const tipo = corpo && typeof corpo === "object" ? String(corpo.tipo || "livres") : "livres";
        const n = /sorte/i.test(tipo)
          ? await qe.reconstruirSumarioSorteio(client)
          : await qe.reconstruirSumario(client);
        responder(res, 200, { ok: true, mensagens: n });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/whatsapp/documento" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const whatsapp = require("../plugins/whatsapp");
        const { destino, arquivo, caption } = await lerBody(req);
        if (!destino || !arquivo) { responder(res, 400, { erro: "destino e arquivo são obrigatórios" }); return; }
        const r = await whatsapp.enviarDocumento(String(destino), String(arquivo), caption || "");
        responder(res, r.ok ? 200 : 400, r);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url.split("?")[0] === "/api/celular" && req.method === "GET") {
      if (!exigeChave(req, res)) return;
      try {
        const celular = require("./celular");
        const st = await celular.status();
        responder(res, 200, { ok: true, ...st });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/celular/conectar" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const celular = require("./celular");
        const r = await celular.conectar();
        responder(res, 200, { ok: r.ok, mensagem: r.msg });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/celular/desconectar" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const celular = require("./celular");
        const r = await celular.desconectar();
        responder(res, 200, { ok: r.ok, mensagem: r.msg });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/celular/espelhar" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const celular = require("./celular");
        const r = await celular.espelhar();
        responder(res, 200, { ok: r.ok, mensagem: r.msg });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/celular/abrir" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const { app } = await lerBody(req);
        if (!app) { responder(res, 400, { erro: "app é obrigatório" }); return; }
        const celular = require("./celular");
        const st = await celular.status();
        if (!st.conectado) { responder(res, 400, { erro: "celular não conectado" }); return; }
        const pacote = celular.acharPacote(String(app).toLowerCase());
        const r = await celular.abrirApp(pacote);
        responder(res, 200, { ok: r.ok, mensagem: r.msg, pacote });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/celular/print" && req.method === "POST") {
      if (!exigeChave(req, res)) return;
      try {
        const celular = require("./celular");
        const st = await celular.status();
        if (!st.conectado) { responder(res, 400, { erro: "celular não conectado" }); return; }
        const r = await celular.printTela();
        if (!r.ok) { responder(res, 400, { erro: r.msg || "falha no print" }); return; }
        const fs = require("fs");
        const b64 = fs.readFileSync(r.caminho, { encoding: "base64" });
        responder(res, 200, { ok: true, imagem: `data:image/png;base64,${b64}` });
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    // ============ PROJETO IMAGEM (thumbnails dos projetos locais) ============
    if (req.url.split("?")[0] === "/api/projeto-imagem" && req.method === "GET") {
      const PROJ_IMAGENS = {
        "webshooter": [
          path.join("C:\\Users\\Pichau\\WebShooter", "preview_v93A.png"),
          path.join("C:\\Users\\Pichau\\WebShooter", "preview_v93B.png"),
          path.join("C:\\Users\\Pichau\\WebShooter", "preview_3d.png"),
          path.join("C:\\Users\\Pichau\\WebShooter", "anotado.png"),
        ],
        "neon-zero-arquimedes": [
          path.join("C:\\Users\\Pichau\\neon-zero-arquimedes", "ANOTACOES.md"),
        ],
        "neon": [
          path.join(PUBLIC_DIR, "icons", "icon-192.png"),
        ],
        "yggdrasil": [
          path.join(PUBLIC_DIR, "icons", "icon-192.png"),
        ],
        "hud": [
          path.join(PUBLIC_DIR, "icons", "icon-192.png"),
        ],
        "spdr-hud": [
          path.join("C:\\Users\\Pichau\\Documents\\Rainmeter\\Skins\\SPDR-HUD", "SysHUD", "SysHUD.ini"),
        ],
      };
      try {
        const qs = new URL(req.url, "http://x").searchParams;
        const projeto = (qs.get("projeto") || "").toLowerCase();
        const candidatas = PROJ_IMAGENS[projeto];
        if (!candidatas) { responder(res, 404, { erro: "projeto desconhecido" }); return; }
        for (const caminho of candidatas) {
          if (fs.existsSync(caminho) && fs.statSync(caminho).isFile()) {
            const ext = path.extname(caminho).toLowerCase();
            const mimeMap = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".gif": "image/gif", ".webp": "image/webp" };
            const mime = mimeMap[ext] || "application/octet-stream";
            res.writeHead(200, { "Content-Type": mime, "Cache-Control": "public, max-age=3600" });
            fs.createReadStream(caminho).pipe(res);
            return;
          }
        }
        responder(res, 404, { erro: "imagem não encontrada" });
      } catch (err) { responder(res, 500, { erro: err.message }); }
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
