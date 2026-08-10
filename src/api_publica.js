const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { log } = require("./logger");
const { askNeon } = require("./ai");
const { MASTER_KEY } = require("./config");

const SSL_DIR = path.join(__dirname, "..", "ssl");
const SSL_PFX = path.join(SSL_DIR, "neon.pfx");
const SSL_PASS = process.env.SSL_PASS || "neonssl2026";
const SSL_PORT = parseInt(process.env.SSL_PORT, 10) || 3443;

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

function temChave(req) {
  return req.headers["x-hud-key"] === MASTER_KEY;
}

function exigeChave(req, res) {
  if (!temChave(req)) {
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

    if (req.url === "/api/arquivos" && req.method === "GET") {
      if (!temChave(req)) { responder(res, 401, { erro: "chave inválida" }); return; }
      try {
        const remoto = require("./remoto");
        const dir = new URL(req.url, "http://x").searchParams.get("dir") || undefined;
        const lista = await remoto.listarDir(dir);
        responder(res, 200, lista);
      } catch (err) { responder(res, 400, { erro: err.message }); }
      return;
    }

    if (req.url === "/api/arquivos/conteudo" && req.method === "GET") {
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

  server.listen(port, "0.0.0.0", () => {
    log("INFO", `[API] Pública rodando em http://0.0.0.0:${port}`);
  });

  if (fs.existsSync(SSL_PFX)) {
    try {
      const ssl = https.createServer(
        { pfx: fs.readFileSync(SSL_PFX), passphrase: SSL_PASS },
        handler
      );
      ssl.listen(SSL_PORT, "0.0.0.0", () => {
        log("INFO", `[API] Segura rodando em https://0.0.0.0:${SSL_PORT}`);
      });
    } catch (err) {
      log("WARN", "[API] Não consegui subir HTTPS", { erro: err.message });
    }
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
