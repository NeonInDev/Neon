// Envio de quirks do pacote migrado para o canal oficial (só dono)
const fs = require("fs");
const path = require("path");

const DADOS = path.join(__dirname, "..", "data", "quirks", "envio_v2.json");
const IMGS = path.join(__dirname, "..", "data", "quirks", "imgs");

let cache = null;

function carregar() {
  if (!cache) cache = JSON.parse(fs.readFileSync(DADOS, "utf8"));
  return cache;
}

function normalizar(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
}

function listar() {
  return carregar().map((q) => q.titulo);
}

function buscar(titulo) {
  const n = normalizar(titulo);
  const l = carregar();
  return l.find((q) => normalizar(q.titulo) === n) || l.find((q) => normalizar(q.titulo).includes(n)) || null;
}

function resolverArquivos(q) {
  return (q.imagens || [])
    .map((u) => {
      if (u.startsWith("LOCAL:")) return path.join(IMGS, u.slice(6));
      const p = u.split("?")[0].split("/");
      let a = p[5] + "_" + p[6].replace(/[^\w.\-() ]/g, "_");
      let f = path.join(IMGS, a);
      if (!fs.existsSync(f)) f = path.join(IMGS, a.replace(/\.webp$/, ".gif"));
      return f;
    })
    .filter((f) => fs.existsSync(f));
}

async function acharCanal(client) {
  let canal = null;
  for (const g of client.guilds.cache.values()) {
    const chans = await g.channels.fetch().catch(() => null);
    if (!chans) continue;
    canal =
      chans.find((c) => c.isTextBased() && c.name.includes("quirks-livres") && !c.name.includes("teste")) ||
      canal;
  }
  return canal;
}

async function enviarQuirk(client, q) {
  const { AttachmentBuilder } = require("discord.js");
  const canal = await acharCanal(client);
  if (!canal) throw new Error("canal quirks-livres não encontrado em nenhum servidor");
  const files = resolverArquivos(q).map((f) => new AttachmentBuilder(f));
  await canal.send({ content: q.textoNovo || q.texto, files });
  return canal;
}

module.exports = { enviarQuirk, buscar, listar };
