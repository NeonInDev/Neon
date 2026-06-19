const express = require("express");
const path = require("path");
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");
const swaggerUi = require("swagger-ui-express");
const apiSpec = require("./api.json");
const { DOCS_PORT } = require("../config");
const { log, getLogs } = require("../logger");
const { askNeon } = require("../ai");
const { executarAcao } = require("../actions");
const voice = require("../voice");

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });
let server = null;

io.on("connection", (socket) => {
  log("DEBUG", "[WS] Dashboard conectado", { id: socket.id });
  socket.emit("logs", getLogs ? getLogs() : []);
  socket.on("disconnect", () => {
    log("DEBUG", "[WS] Dashboard desconectado", { id: socket.id });
  });
});

function broadcast(event, data) {
  try { io.emit(event, data) } catch {}
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "..", "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "..", "public", "index.html"));
});

app.post("/api/ask", async (req, res) => {
  const { userId, username, message } = req.body;
  if (!message) return res.status(400).json({ error: "message é obrigatório" });
  try {
    const resultadoAcao = await executarAcao(message, true, userId || "1442928336329379925");
    if (resultadoAcao) return res.json({ reply: resultadoAcao });

    const reply = await askNeon(userId || "local", username || "local", message);
    res.json({ reply });
  } catch (err) {
    log("ERROR", "Local API erro", { erro: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/voice/toggle", async (req, res) => {
  const st = voice.status();
  if (st.ativo) {
    await voice.parar();
    res.json({ ativo: false });
  } else {
    const ok = await voice.iniciar(req.body?.userId || "1442928336329379925", "Dono");
    res.json({ ativo: ok });
  }
});

app.get("/api/voice/status", (req, res) => {
  res.json(voice.status());
});

app.get("/api/status", async (req, res) => {
  try {
    const pc = require("../pc");
    if (typeof pc.pcInfoJson === "function") {
      const info = await pc.pcInfoJson();
      return res.json(info);
    }
    res.json({ erro: "pcInfoJson nao disponivel" });
  } catch (err) {
    res.json({ erro: err.message });
  }
});

app.get("/api/logs", async (req, res) => {
  try {
    const { getLogs } = require("../logger");
    res.json(getLogs ? getLogs() : []);
  } catch {
    res.json([]);
  }
});

app.get("/api/camera", async (req, res) => {
  try {
    const camera = require("../camera");
    const st = await camera.status();
    res.json(st);
  } catch {
    res.json({ online: false, erro: "camera module unavailable" });
  }
});

app.post("/api/camera/snapshot", async (req, res) => {
  try {
    const camera = require("../camera");
    const buf = await camera.capturarFrame();
    res.type("image/jpeg").send(buf);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post("/api/camera/url", async (req, res) => {
  try {
    const camera = require("../camera");
    const msg = await camera.definirUrl(req.body.url);
    res.json({ ok: true, msg });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/api/memoria", async (req, res) => {
  try {
    const { listar, estatisticas } = require("../memoria");
    res.json({ memorias: await listar(), stats: await estatisticas() });
  } catch {
    res.json({ erro: "memoria indisponivel" });
  }
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(apiSpec, {
  customSiteTitle: "Neon Bot — Documentação",
}));

function startDocsServer() {
  return new Promise((resolve, reject) => {
    const tentar = (porta) => {
      server = httpServer.listen(porta);
      server.on("listening", () => resolve(porta));
      server.on("error", (err) => {
        if (err.code === "EADDRINUSE" && porta < DOCS_PORT + 10) {
          log("WARN", `Porta ${porta} ocupada, tentando ${porta + 1}...`);
          tentar(porta + 1);
        } else {
          reject(err);
        }
      });
    };
    tentar(DOCS_PORT);
  });
}

function getIO() { return io }
function getBroadcast() { return broadcast }

function getUrl(port) {
  return `http://localhost:${port}`;
}

function stopDocsServer() {
  if (server) server.close();
}

app.get("/api/audit", async (req, res) => {
  try {
    const { lerAudit } = require("../permissions");
    const linhas = parseInt(req.query.linhas) || 20;
    res.json(lerAudit(linhas));
  } catch { res.json([]) }
});

app.get("/api/contexto", async (req, res) => {
  try {
    const { estatisticas } = require("../contexto");
    res.json(estatisticas());
  } catch { res.json({}) }
});

app.get("/api/clima", async (req, res) => {
  try {
    const { clima, climaManhaFormatado } = require("../clima");
    const c = await clima(req.query.cidade);
    res.json({ ...c, resumo: climaManhaFormatado() });
  } catch { res.json({ erro: "clima indisponivel" }) }
});

app.get("/api/alarmes", async (req, res) => {
  try {
    const { listar } = require("../lembrete_alarme");
    res.json(listar());
  } catch { res.json([]) }
});

app.get("/api/fila", async (req, res) => {
  try {
    const { listar } = require("../fila");
    res.json(listar());
  } catch { res.json([]) }
});

app.get("/api/whatsapp/status", async (req, res) => {
  try {
    const { status } = require("../whatsapp");
    res.json(await status());
  } catch { res.json({ conectado: false }) }
});

app.get("/api/email/status", async (req, res) => {
  try {
    const { status } = require("../email");
    res.json(await status());
  } catch { res.json({ configurado: false }) }
});

app.get("/api/calendario/status", async (req, res) => {
  try {
    const { status } = require("../calendario");
    res.json(await status());
  } catch { res.json({ autenticado: false }) }
});

module.exports = { startDocsServer, getUrl, stopDocsServer, getIO, getBroadcast };
