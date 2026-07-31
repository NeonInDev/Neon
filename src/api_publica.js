const http = require("http");
const fs = require("fs");
const path = require("path");
const { log } = require("./logger");
const { askNeon } = require("./ai");

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
};

let server = null;

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

function servirArquivo(url, res) {
  let caminho;
  if (url === "/" || url === "/dashboard") caminho = path.join(PUBLIC_DIR, "index.html");
  else if (url === "/hud") caminho = path.join(PUBLIC_DIR, "hud", "index.html");
  else if (url === "/manifest.json") caminho = path.join(PUBLIC_DIR, "manifest.json");
  else if (url.startsWith("/public/")) caminho = path.join(PUBLIC_DIR, url.slice("/public/".length));
  else return false;

  const base = path.resolve(PUBLIC_DIR);
  const resolved = path.resolve(caminho);
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

  server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && servirArquivo(req.url, res)) return;

    if (req.url === "/api/chat" && req.method === "POST") {
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

    if (req.url === "/api/pc" && req.method === "GET") {
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
      try {
        const pc = require("./pc");
        const b64 = await pc.screenshotBase64();
        responder(res, 200, { ok: true, imagem: `data:image/png;base64,${b64}` });
      } catch (err) { responder(res, 500, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/pc/notificar" && req.method === "POST") {
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
      try {
        const { texto, voz } = await lerBody(req);
        if (!texto) { responder(res, 400, { erro: "texto é obrigatório" }); return; }
        const tts = require("./tts");
        const mp3 = await tts.gerarAudio(texto, voz);
        if (!mp3) { responder(res, 500, { erro: "TTS indisponível" }); return; }
        res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": mp3.length });
        res.end(mp3);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    responder(res, 404, { erro: "rota não encontrada" });
  });

  server.listen(port, "0.0.0.0", () => {
    log("INFO", `[API] Pública rodando em http://0.0.0.0:${port}`);
  });

  return server;
}

function parar() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = { iniciar, parar };
