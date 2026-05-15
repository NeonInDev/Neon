const express = require("express");
const swaggerUi = require("swagger-ui-express");
const apiSpec = require("./api.json");

const app = express();
let server = null;

function startDocsServer(port = 3000) {
  return new Promise((resolve) => {
    app.use("/", swaggerUi.serve, swaggerUi.setup(apiSpec, {
      customSiteTitle: "Neon Bot — Documentação",
    }));

    server = app.listen(port, () => resolve(port));
  });
}

function getUrl(port) {
  return `http://localhost:${port}`;
}

function stopDocsServer() {
  if (server) server.close();
}

module.exports = { startDocsServer, getUrl, stopDocsServer };
