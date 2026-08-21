const fs = require("fs");

function limpar(entrada, saida) {
  const linhas = fs.readFileSync(entrada, "utf8").split(/\r?\n/);
  const out = [];
  for (let linha of linhas) {
    if (/^---+\s*$/.test(linha)) continue;
    linha = linha.replace(/^#\s+(.*)$/, "*$1*");
    linha = linha.replace(/^>\s?(.*)$/, "$1");
    out.push(linha);
  }
  let txt = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  fs.writeFileSync(saida, txt + "\n", "utf8");
  console.log(`${saida}: ${txt.length} chars`);
}

limpar(
  "C:/Users/Pichau/estudos/revisao_geografia_global_2tri.md",
  "C:/Users/Pichau/estudos/revisao_geografia_global_2tri.txt"
);
limpar(
  "C:/Users/Pichau/estudos/revisao_ingles_global_2tri.md",
  "C:/Users/Pichau/estudos/revisao_ingles_global_2tri.txt"
);
