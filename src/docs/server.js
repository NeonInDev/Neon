const express = require("express");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const apiSpec = require("./api.json");
const { DOCS_PORT } = require("../config");
const { log } = require("../logger");
const { askNeon } = require("../ai");
const { executarAcao } = require("../actions");
const voice = require("../voice");

const app = express();
let server = null;

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

app.use("/docs", swaggerUi.serve, swaggerUi.setup(apiSpec, {
  customSiteTitle: "Neon Bot — Documentação",
}));

function startDocsServer() {
  return new Promise((resolve, reject) => {
    const tentar = (porta) => {
      server = app.listen(porta);
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

function getUrl(port) {
  return `http://localhost:${port}`;
}

function stopDocsServer() {
  if (server) server.close();
}

module.exports = { startDocsServer, getUrl, stopDocsServer };
