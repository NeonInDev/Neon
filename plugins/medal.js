const { log } = require("../src/logger");
const fs = require("fs");
const path = require("path");

const RAIZ = "C:\\Medal";
const EXTENSOES_VIDEO = new Set([".mp4", ".webm", ".mkv", ".mov"]);
const EXTENSOES_IMAGEM = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function encontrarMaisRecente(pasta, extensoes) {
  if (!fs.existsSync(pasta)) return null;
  const encontrados = [];
  const visitar = (atual) => {
    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {
      const caminho = path.join(atual, item.name);
      if (item.isDirectory()) visitar(caminho);
      else if (extensoes.has(path.extname(item.name).toLowerCase())) {
        const stat = fs.statSync(caminho);
        encontrados.push({ caminho, tamanho: stat.size, modificadoEm: stat.mtimeMs });
      }
    }
  };
  visitar(pasta);
  encontrados.sort((a, b) => b.modificadoEm - a.modificadoEm);
  return encontrados[0] || null;
}

function ultimaScreenshot() {
  return encontrarMaisRecente(path.join(RAIZ, "Screenshots"), EXTENSOES_IMAGEM);
}

function ultimaGravacao() {
  return encontrarMaisRecente(path.join(RAIZ, "Clips"), EXTENSOES_VIDEO);
}

module.exports = {
  nome: "Medal",
  versao: "1.0",
  desc: "Busca a última screenshot e a última gravação local do Medal.",

  async iniciar() {
    log("INFO", "[MEDAL] Plugin carregado", { raiz: RAIZ });
  },

  async parar() {
    log("INFO", "[MEDAL] Plugin parado");
  },

  ultimaScreenshot,
  ultimaGravacao,
  ferramentas: [
    {
      name: "medal_ultima_screenshot",
      description: "Retorna o caminho da screenshot mais recente salva pelo Medal.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "medal_ultima_gravacao",
      description: "Retorna o caminho da gravação/clipe mais recente salva pelo Medal.",
      inputSchema: { type: "object", properties: {} },
    },
  ],

  acoes: [],
};