// Cross-reference: toda funcao definida como `async` e chamada dentro de
// if/while sem `await`. Sem await, o if recebe uma Promise, que e sempre
// truthy - foi exatamente o bug que calou a Neon em todos os canais.
const fs = require("fs");
const path = require("path");

const raiz = process.argv[2] || ".";
const alvos = [];
function varrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) varrer(p);
    else if (e.name.endsWith(".js")) alvos.push(p);
  }
}
varrer(raiz);

const asyncNames = new Set();
for (const f of alvos) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/async\s+function\s+([A-Za-z_$][\w$]*)/g)) asyncNames.add(m[1]);
  for (const m of src.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*async\b/g)) asyncNames.add(m[1]);
}
console.log(`funcoes async encontradas: ${asyncNames.size}\n`);

const achados = [];
for (const f of alvos) {
  const linhas = fs.readFileSync(f, "utf8").split(/\r?\n/);
  linhas.forEach((line, i) => {
    const m = line.match(/^\s*(?:if|while)\s*\(([^)]*)\)/);
    if (!m) return;
    const cond = m[1];
    if (/\bawait\b/.test(cond)) return;
    for (const nome of asyncNames) {
      const re = new RegExp(`(^|[^.\\w$])${nome.replace(/\$/g, "\\$")}\\s*\\(`);
      if (re.test(cond)) {
        achados.push(`${f}:${i + 1}  ${line.trim()}`);
        break;
      }
    }
  });
}

if (!achados.length) console.log("nenhum if/while chamando async sem await");
else achados.forEach((a) => console.log(a));
console.log(`\ntotal: ${achados.length}`);
