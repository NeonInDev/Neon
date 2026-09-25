// Versao legivel do backup: um arquivo .txt por canal com conteudo,
// mais um indice com TODOS os canais (nome) do servidor.
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "data", "backup_new_genesis_v2");
const ARQ = path.join(DIR, "conteudo.json");
const d = JSON.parse(fs.readFileSync(ARQ, "utf8"));

const nomes = new Map(d.canaisNome.map((c) => [c.id, c]));
const catDe = new Map(d.categorias.map((c) => [c.id, c.nome]));

function dataBR(iso) {
  if (!iso) return "?";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

function linha(m) {
  const partes = [`[${dataBR(m.data)}] ${m.autor?.tag || m.autor?.username || "?"}${m.autor?.bot ? " (bot)" : ""}`];
  if (m.conteudo) partes.push(m.conteudo);
  const extra = [];
  for (const a of m.anexos || []) extra.push(`   📎 anexo: ${a.nome} (${a.tipo}, ${Math.round((a.bytes || 0) / 1024)}kb) ${a.url}`);
  for (const e of m.embeds || []) {
    if (e.titulo || e.descricao) extra.push(`   🧷 ${e.titulo || ""} ${e.descricao || ""}`.trimEnd());
  }
  if (m.figurinhas?.length) extra.push(`   🩹 figurinha: ${m.figurinhas.join(", ")}`);
  if (m.respostaA) extra.push(`   ↩️ resposta a ${m.respostaA}`);
  return `${partes.join(" ")}\n${extra.join("\n")}`;
}

const dirTxt = path.join(DIR, "canais");
fs.mkdirSync(dirTxt, { recursive: true });

const usados = new Set();
const ids = Object.keys(d.conteudo).filter((k) => !k.startsWith("thread:"));
for (const id of ids) {
  const msgs = d.conteudo[id];
  if (!Array.isArray(msgs) || !msgs.length) continue;
  const c = nomes.get(id);
  const nome = c?.nome || id;
  const arquivo = path.join(dirTxt, `${nome.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 80)}_${id}.txt`);
  const cab = [
    `CANAL: ${nome}`,
    `ID: ${id}`,
    `CATEGORIA: ${catDe.get(c?.categoria) || c?.categoriaNome || "avulso"}`,
    c?.assunto ? `ASSUNTO: ${c.assunto}` : null,
    `MENSAGENS: ${msgs.length}`,
    `EXPORTADO: ${d.servidor.exportadoEm}`,
    "=".repeat(60),
    "",
  ].filter(Boolean).join("\n");
  fs.writeFileSync(arquivo, cab + msgs.map(linha).join("\n\n"));
  usados.add(id);
}

// threads
const threads = Object.keys(d.conteudo).filter((k) => k.startsWith("thread:"));
if (threads.length) {
  const linhas = [];
  for (const k of threads) {
    const arr = d.conteudo[k];
    if (!Array.isArray(arr) || !arr.length) continue;
    const meta = arr.meta || {};
    linhas.push(`\n${"=".repeat(60)}\nTHREAD: ${meta.nome || k}  (no canal ${meta.canal || "?"})  ${arr.length} msgs\n${"-".repeat(60)}`);
    linhas.push(arr.map(linha).join("\n\n"));
  }
  if (linhas.length) fs.writeFileSync(path.join(dirTxt, "_threads.txt"), linhas.join("\n"));
}

// indice geral: TODOS os canais, por categoria
const idx = [];
idx.push(`BACKUP ${d.servidor.nome} (${d.servidor.id})`);
idx.push(`exportado em ${d.servidor.exportadoEm}`);
idx.push(`canais: ${d.servidor.canais} | categorias: ${d.servidor.categorias} | membros: ${d.servidor.membros}`);
idx.push(`mensagens salvas: ${d.resumo?.mensagensTotais ?? "?"} em ${d.resumo?.canaisComConteudo ?? "?"} canais`);
idx.push("");
for (const cat of d.categorias) {
  idx.push(`\n■ ${cat.nome}${cat.backupConteudo ? "   << CONTEUDO SALVO" : ""}`);
  const filhos = d.canaisNome.filter((c) => c.categoria === cat.id);
  for (const c of filhos) {
    const n = Array.isArray(d.conteudo[c.id]) ? d.conteudo[c.id].length : 0;
    idx.push(`   ${c.temConteudo ? "[TEXTO]" : "[nome]"} ${c.nome}  ${n ? `(${n} msgs)` : ""}`);
  }
}
const soltos = d.canaisNome.filter((c) => !c.categoria);
if (soltos.length) {
  idx.push("\n■ sem categoria");
  for (const c of soltos) idx.push(`   ${c.temConteudo ? "[TEXTO]" : "[nome]"} ${c.nome}`);
}
fs.writeFileSync(path.join(DIR, "INDICE.txt"), idx.join("\n"));

console.log(`arquivos .txt: ${fs.readdirSync(dirTxt).length}`);
console.log(`INDICE.txt criado`);
console.log(`total de mensagens: ${d.resumo.mensagensTotais}`);
