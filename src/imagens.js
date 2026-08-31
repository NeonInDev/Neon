const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const { log } = require("./logger");

const SCRIPT = path.join(__dirname, "..", "scripts", "remover_fundo.py");

function removerFundo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const entrada = path.resolve(inputPath);
    if (!fs.existsSync(entrada)) {
      return reject(new Error(`Arquivo não encontrado: ${entrada}`));
    }

    const saida = outputPath
      ? path.resolve(outputPath)
      : entrada.replace(/\.(png|jpg|jpeg)$/i, "_sem_fundo.png");

    log("INFO", "[IMAGENS] Removendo fundo", { entrada: path.basename(entrada), saida: path.basename(saida) });

    execFile("python", [SCRIPT, entrada, saida], { timeout: 180000 }, (err, stdout, stderr) => {
      if (err) {
        log("ERROR", "[IMAGENS] Falha ao remover fundo", { erro: err.message });
        return reject(err);
      }
      if (!fs.existsSync(saida)) {
        return reject(new Error("Arquivo de saída não foi criado"));
      }
      log("INFO", "[IMAGENS] Fundo removido", { saida: path.basename(saida) });
      resolve(saida);
    });
  });
}

module.exports = { removerFundo };