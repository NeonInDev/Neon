const fs = require("fs");
const { EmbedBuilder } = require("discord.js");
const src = fs.readFileSync("src/commands/relatorio.js", "utf8");
const corpo = src.slice(src.indexOf("const AZUL"), src.indexOf("async function embedsPC"));
const factory = new Function("EmbedBuilder", corpo + "; return embedsProjeto;")(EmbedBuilder);

const json = factory().map((e) => e.toJSON());
let total = 0;
let problemas = 0;

json.forEach((e, i) => {
  const d = (e.description || "").length;
  const t = (e.title || "").length;
  total += d + t;
  console.log(`embed ${i + 1}: titulo ${t}/256 | desc ${d}/4096 | campos ${(e.fields || []).length}/25`);
  (e.fields || []).forEach((x, j) => {
    const v = (x.value || "").length;
    const nome = (x.name || "").length;
    const estourou = v > 1024 || nome > 256;
    if (estourou) problemas++;
    console.log(`   campo ${j + 1}: nome ${nome}/256, valor ${v}/1024${estourou ? "   <<< ESTOURA" : ""}`);
  });
});

console.log(`soma titulo+desc = ${total}/6000`);
console.log(problemas ? `FALHA: ${problemas} campo(s) acima do limite` : "OK: tudo dentro dos limites do Discord");
