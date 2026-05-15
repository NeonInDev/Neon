const express = require("express");
const swaggerUi = require("swagger-ui-express");
const apiSpec = require("./api.json");
const { DOCS_PORT } = require("../config");
const { log } = require("../logger");

const app = express();
let server = null;

app.use("/", swaggerUi.serve, swaggerUi.setup(apiSpec, {
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
