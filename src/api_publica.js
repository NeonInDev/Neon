const http = require("http");
const { log } = require("./logger");
const { askNeon } = require("./ai");

let server = null;

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

    if (req.url === "/api/chat" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => body += chunk);
      req.on("end", async () => {
        try {
          const { mensagem, usuario, userId } = JSON.parse(body);
          if (!mensagem) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ erro: "mensagem é obrigatória" }));
            return;
          }

          const reply = await askNeon(userId || "api_anon", usuario || "Anônimo", mensagem);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ resposta: reply }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ erro: err.message }));
        }
      });
      return;
    }

    if (req.url === "/api/status" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "online", versao: "2.0.0" }));
      return;
    }

    if (req.url === "/api/visao" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => body += chunk);
      req.on("end", async () => {
        try {
          const { imagem } = JSON.parse(body);
          if (!imagem) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ erro: "imagem (base64) é obrigatória" }));
            return;
          }
          const pc = require("./pc");
          const resultado = await pc.analisarImagem(imagem);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(resultado));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ erro: err.message }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ erro: "rota não encontrada" }));
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
