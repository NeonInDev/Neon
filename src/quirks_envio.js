// Pacote de quirks migrado + envio em canais + sumário automático
const fs = require("fs");
const path = require("path");

const DADOS = path.join(__dirname, "..", "data", "quirks", "envio_v2.json");
const IMGS = path.join(__dirname, "..", "data", "quirks", "imgs");
const MARCADOR = "⊹₊˚ʚ  Sumário!";

let cache = null;

function carregar() {
  if (!cache) cache = JSON.parse(fs.readFileSync(DADOS, "utf8"));
  return cache;
}

function persistir() {
  fs.writeFileSync(DADOS, JSON.stringify(carregar(), null, 1));
}

function normalizar(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// só letras/números/espaço — ignora enfeites tipo 𑁍 ˖ 𖥔 que vêm dentro do negrito em alguns cards
function nucleo(s) {
  return normalizar(s).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// casa título capturado de um card com um nome do pacote, dos dois lados
function mesmoTitulo(capturado, nome) {
  const a = nucleo(capturado);
  const b = nucleo(nome);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
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

// tipo: "livres" | "sorteio"
function nomeAlvo(tipo) {
  return /sorte/i.test(tipo || "") ? "sorteio" : "quirks-livres";
}

async function acharCanal(client, tipo) {
  const alvo = nomeAlvo(tipo);
  const querSorteio = alvo === "sorteio";
  let canal = null;
  for (const g of client.guilds.cache.values()) {
    const chans = await g.channels.fetch().catch(() => null);
    if (!chans) continue;
    canal =
      chans.find(
        (c) =>
          c.isTextBased() &&
          !c.name.includes("teste") &&
          c.name.includes("quirk") &&
          (querSorteio ? c.name.includes("sorteio") : c.name.includes("livre"))
      ) || canal;
  }
  return canal;
}

async function enviarQuirk(client, q, tipo) {
  const { AttachmentBuilder } = require("discord.js");
  const canal = await acharCanal(client, tipo);
  if (!canal) throw new Error(`canal de quirks (${nomeAlvo(tipo)}) não encontrado`);
  const files = resolverArquivos(q).map((f) => new AttachmentBuilder(f));
  const msg = await canal.send({ content: q.textoNovo || q.texto, files });
  q.canal = nomeAlvo(tipo);
  q.link = msg.url;
  persistir();
  return msg;
}

async function acharMensagem(canal, titulo) {
  const alvo = `**${titulo};**`;
  let antes = null;
  for (let i = 0; i < 10; i++) {
    const lote = await canal.messages.fetch({ limit: 100, before: antes }).catch(() => null);
    if (!lote || !lote.size) break;
    let hit = lote.find((m) => m.content.includes(alvo));
    if (!hit) {
      hit = lote.find((m) => {
        const t = m.content.match(/\*\*([^*\n]{1,100}?);\*\*/);
        return t && mesmoTitulo(t[1], titulo);
      });
    }
    if (hit) return hit;
    antes = lote.last().id;
  }
  return null;
}

function atualizarTexto(titulo, novoTexto) {
  const l = carregar();
  const q = buscar(titulo);
  if (!q) return false;
  q.textoNovo = novoTexto;
  persistir();
  return true;
}

function remover(titulo) {
  let l = carregar();
  const antes = l.length;
  l = l.filter((x) => x.titulo !== titulo);
  cache = l;
  persistir();
  return antes - l.length;
}

// ===== SUMÁRIO =====

// varre o canal e guarda o link de cada card já enviado que ainda não tem link no pacote
async function mapearLinks(canal) {
  let antes = null;
  let novos = 0;
  for (let i = 0; i < 12; i++) {
    const lote = await canal.messages.fetch({ limit: 100, before: antes }).catch(() => null);
    if (!lote || !lote.size) break;
    for (const m of lote.values()) {
      const t = m.content.match(/\*\*([^*\n]{1,100}?);\*\*/);
      if (!t) continue;
      const q = carregar().find((x) => !x.link && mesmoTitulo(t[1], x.titulo));
      if (q) {
        q.link = m.url;
        q.canal = "livres";
        novos++;
      }
    }
    antes = lote.last().id;
  }
  if (novos) persistir();
  return novos;
}

async function apagarSumarioAntigo(canal, client) {
  let antes = null;
  const apagar = [];
  for (let i = 0; i < 10; i++) {
    const lote = await canal.messages.fetch({ limit: 100, before: antes }).catch(() => null);
    if (!lote || !lote.size) break;
    for (const m of lote.values()) {
      if (m.author.id === client.user.id && m.content.startsWith(MARCADOR)) apagar.push(m);
    }
    antes = lote.last().id;
  }
  for (const m of apagar) await m.delete().catch(() => {});
  return apagar.length;
}

function montarChunksSumario() {
  const lista = [...carregar()].sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  const secoes = [];
  let letra = "";
  let atual = "";
  for (const q of lista) {
    const inicial = (q.titulo.normalize("NFD").replace(/[^A-Za-zÀ-ÿ]/g, "").match(/[A-ZÀ-Ý]/) || ["#"])[0].toUpperCase();
    if (inicial !== letra) {
      if (atual) secoes.push(atual);
      letra = inicial;
      atual = `__**— ${letra} —**__\n`;
    }
    const item = q.link ? `[${q.titulo}](${q.link})` : q.titulo;
    if (atual.length + item.length > 1750) {
      secoes.push(atual);
      atual = `__**— ${letra} (cont.) —**__\n`;
    }
    atual += `${item}\n`;
  }
  if (atual) secoes.push(atual);

  // quebrar em mensagens de até ~1800 chars, cada uma começando com o marcador
  const msgs = [];
  let buf = "";
  for (const s of secoes) {
    if (buf.length + s.length > 1700) {
      msgs.push(buf);
      buf = "";
    }
    buf += s;
  }
  if (buf) msgs.push(buf);
  return msgs.map((t, i) => `${MARCADOR}${msgs.length > 1 ? ` (${i + 1}/${msgs.length})` : ""}\n\n${t}`);
}

async function reconstruirSumario(client) {
  const canal = await acharCanal(client, "livres");
  if (!canal) throw new Error("canal quirks-livres não encontrado pro sumário");
  await apagarSumarioAntigo(canal, client);
  await mapearLinks(canal);
  const chunks = montarChunksSumario();
  for (const c of chunks) await canal.send({ content: c });
  return chunks.length;
}

module.exports = {
  enviarQuirk,
  buscar,
  listar,
  acharCanal,
  acharMensagem,
  atualizarTexto,
  remover,
  reconstruirSumario,
};
