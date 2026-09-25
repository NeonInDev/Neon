// Gera src/atributos.json a partir dos cargos reais do New Genesis.
// Padrao: "<categoria> - Rank <X>". A escada vai de F (mais baixo) ate Z.
const fs = require("fs");
const path = require("path");

const ARQ = path.join(__dirname, "..", "data", "cargos_new_genesis.json");
const cargos = JSON.parse(fs.readFileSync(ARQ, "utf8"));
const ESCADA = ["F", "E", "D", "C", "B", "A", "S", "SS", "Z"];

const mapa = {}; // categoria -> { rank -> roleId }
for (const c of cargos) {
  const nome = c.nome.replace(/꒰|꒱|˖|˚|₊/g, " ").replace(/\s+/g, " ").trim();
  const r = nome.match(/^(.*?)\s+-\s+Rank\s+(Z|SS|S|A|B|C|D|E|F)$/i);
  if (!r) continue;
  const cat = r[1].trim();
  const rank = r[2].toUpperCase();
  if (!mapa[cat]) mapa[cat] = {};
  mapa[cat][rank] = c.id;
}

const out = {};
for (const [cat, ranks] of Object.entries(mapa).sort()) {
  const ordenados = ESCADA.filter((r) => ranks[r]);
  out[cat] = { ranks, ordem: ordenados };
  console.log(`${cat}: ${ordenados.join(" < ")}`);
}

const destino = path.join(__dirname, "..", "src", "atributos.json");
fs.writeFileSync(destino, JSON.stringify(out, null, 2));
console.log(`\n${Object.keys(out).length} categorias -> src/atributos.json`);
