// Pacote de quirks migrado + envio em canais + sumário automático
const fs = require("fs");
const path = require("path");

const DADOS = path.join(__dirname, "..", "data", "quirks", "envio_v2.json");
const IMGS = path.join(__dirname, "..", "data", "quirks", "imgs");
const FANDOM = path.join(__dirname, "..", "data", "quirks", "fandom.json");
const ADICIONADAS = path.join(__dirname, "..", "data", "quirks", "adicionadas.json");
const APAGADAS = path.join(__dirname, "..", "data", "quirks", "apagadas.json");
const MARCADOR = "⊹₊˚ʚ 📚 Sumário";
const EMOJIS_LETRA = ["🌟", "✨", "⚡", "🌀", "🧬", "💫", "🔮", "🦋", "🔥", "🌊", "🌙", "⭐", "🍀", "🎭", "💎", "🌸"];
const EMOJI_TIPO = { Emissora: "⚡", Mutação: "🧬", Transformação: "🌀" };

let cache = null;
let cacheFandom = null;
let cacheAdic = null;

function carregar() {
  if (!cache) cache = JSON.parse(fs.readFileSync(DADOS, "utf8"));
  return cache;
}

function persistir() {
  fs.writeFileSync(DADOS, JSON.stringify(carregar(), null, 1));
}

function carregarFandom() {
  if (!cacheFandom) cacheFandom = JSON.parse(fs.readFileSync(FANDOM, "utf8"));
  return cacheFandom;
}

function persistirFandom() {
  fs.writeFileSync(FANDOM, JSON.stringify(carregarFandom(), null, 1));
}

function listarFandom() {
  return carregarFandom().map((q) => q.nome);
}

function buscarFandom(nome) {
  const n = normalizar(nome);
  const l = carregarFandom();
  return (
    l.find((q) => normalizar(q.nome) === n) ||
    l.find((q) => nucleo(q.nome).includes(nucleo(nome))) ||
    null
  );
}

function carregarAdicionadas() {
  if (!cacheAdic) {
    try {
      cacheAdic = JSON.parse(fs.readFileSync(ADICIONADAS, "utf8"));
    } catch {
      cacheAdic = [];
    }
  }
  return cacheAdic;
}

function salvarAdicionadas(l) {
  cacheAdic = l;
  fs.writeFileSync(ADICIONADAS, JSON.stringify(l, null, 1));
}

function registrarApagada(origem, dados) {
  let l = [];
  try {
    l = JSON.parse(fs.readFileSync(APAGADAS, "utf8"));
  } catch {}
  l.push({
    de: origem,
    titulo: dados.titulo,
    textoNovo: dados.textoNovo || dados.texto || "",
    tipo: dados.tipo || null,
  });
  fs.writeFileSync(APAGADAS, JSON.stringify(l, null, 1));
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
  return [...carregar(), ...carregarAdicionadas()].map((q) => q.titulo);
}

function buscar(titulo) {
  const n = normalizar(titulo);
  const l = [...carregar(), ...carregarAdicionadas()];
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

// ===== TRADUÇÃO (descrições da fandom vêm em inglês) =====

const traducoesEmCurso = new Map();

// traduz a descrição pra PT-BR uma única vez por quirk e guarda no fandom.json
async function traduzirDescricao(f) {
  if (!f.descricao) return "";
  if (f.descricaoPt) return f.descricaoPt;
  const ja = traducoesEmCurso.get(f.nome);
  if (ja) return ja;
  const tarefa = (async () => {
    try {
      const { chamarLLM } = require("./ai");
      const pt = await chamarLLM(
        "Você é um tradutor. Traduza o texto para português do Brasil. Mantenha nomes próprios de personagens, lugares e quirks no original. Não resuma, não comente, não adicione aspas: responda SOMENTE com a tradução fiel completa.",
        f.descricao
      );
      if (pt && pt.length > 20 && !/^(desculpe|sorry)/i.test(pt)) {
        f.descricaoPt = pt;
        persistirFandom();
        return pt;
      }
    } catch {}
    return f.descricao;
  })();
  traducoesEmCurso.set(f.nome, tarefa);
  try {
    return await tarefa;
  } finally {
    traducoesEmCurso.delete(f.nome);
  }
}

// procura um painel da quirk nos bancos prontos (pacote + adicionadas)
function painelDe(titulo) {
  const todos = [...carregar(), ...carregarAdicionadas()];
  const q = todos.find((x) => mesmoTitulo(x.titulo, titulo));
  if (!q) return null;
  return resolverArquivos(q)[0] || null;
}

// limpa sujeira de scrape no campo usuário (<br>, tags soltas)
function limparUsuario(u) {
  return String(u || "")
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/<[^>]+>/g, "")
    .replace(/(?:\s*\/\s*){2,}/g, " / ")
    .replace(/^\s*\/\s*|\s*\/\s*$/g, "")
    .trim();
}

// descreve dentro do orçamento de caracteres: inteira se couber, senão condensa com IA (1x, fica salvo)
async function encaixarTexto(f, orcamento) {
  const bruto = String(await traduzirDescricao(f)).replace(/\n{2,}/g, "\n").trim();
  if (bruto.length <= orcamento) return bruto;

  if (!f.descricaoPtCurta) {
    try {
      const { chamarLLM } = require("./ai");
      const curta = await chamarLLM(
        "Encurte o texto a seguir para no máximo " +
          Math.floor(orcamento * 0.95) +
          " caracteres, em português do Brasil, mantendo TODAS as informações mecânicas essenciais (o que faz, como usa, limites e fraquezas). Não comente nada: responda só o texto encurtado.",
        bruto
      );
      if (curta && curta.length <= orcamento && curta.length > 20) {
        f.descricaoPtCurta = curta;
        persistirFandom();
      }
    } catch {}
  }
  if (f.descricaoPtCurta && f.descricaoPtCurta.length <= orcamento) return f.descricaoPtCurta;

  // último recurso: corta em fim de frase
  let d = bruto.slice(0, orcamento);
  const ponto = Math.max(d.lastIndexOf("."), d.lastIndexOf("!"), d.lastIndexOf("?"));
  if (ponto > 80) d = d.slice(0, ponto + 1);
  return d;
}

// card no molde Quirk File oficial do servidor, montado a partir dos dados da fandom
async function montarCardFandom(f) {
  const { moldeQuirkFile } = require("./moldes");
  const desc = await encaixarTexto(f, 1300);
  return moldeQuirkFile({
    titulo: f.nome,
    descricao: `💭 ${desc}`,
    tipo: f.tipo || "Desconhecido",
    usuario: f.usuario ? limparUsuario(f.usuario) : undefined,
  });
}

// resumo de uma quirk canônica da fandom (pra /quirk informação)
async function informacao(nome) {
  const { moldeQuirkFile } = require("./moldes");
  const f = buscarFandom(nome);
  if (!f) return null;
  const e = EMOJI_TIPO[f.tipo] || "✨";

  // encaixe: o texto é prioridade máxima — usuário sempre entra; link só se sobrar espaço
  let orcamento = Math.max(1980 - 500, 200);
  const desc = await encaixarTexto(f, orcamento);

  const texto = moldeQuirkFile({
    titulo: f.nome,
    descricao: `💭 ᝢ ${desc}`,
    tipo: `${f.tipo || "Desconhecido"} ${e}`,
    usuario: f.usuario ? limparUsuario(f.usuario) : undefined,
  });

  const linkBonito = `🔗 <${f.url}>`;
  const linkCurto = `🔗 ${f.url}`;
  if (texto.length + linkBonito.length + 2 <= 2000) return { texto: texto + "\n\n" + linkBonito, fandom: f, painel: painelDe(f.nome) };
  if (texto.length + linkCurto.length + 2 <= 2000) return { texto: texto + "\n\n" + linkCurto, fandom: f, painel: painelDe(f.nome) };

  return { texto: texto.slice(0, 2000), fandom: f, painel: painelDe(f.nome) };
}

// sugestões próximas quando não achar o nome exato
function sugerirNomes(nome, banco) {
  const alvo = nucleo(nome);
  if (!alvo) return [];
  return banco.filter((t) => nucleo(t).startsWith(alvo)).slice(0, 3);
}

async function enviarQuirk(client, q, tipo, origem = "pacote") {
  const { AttachmentBuilder } = require("discord.js");
  const canal = await acharCanal(client, tipo);
  if (!canal) throw new Error(`canal de quirks (${nomeAlvo(tipo)}) não encontrado`);

  if (origem === "fandom") {
    const card = await montarCardFandom(q);
    const painel = painelDe(q.nome);
    const files = painel ? [new AttachmentBuilder(painel)] : [];
    const msg = await canal.send({ content: card, files });
    const adic = carregarAdicionadas().filter((x) => !mesmoTitulo(x.titulo, q.nome));
    adic.push({
      titulo: q.nome,
      textoNovo: card,
      tipo: q.tipo,
      link: msg.url,
      canal: nomeAlvo(tipo),
      imagens: painel ? ["LOCAL:" + path.basename(painel)] : [],
    });
    salvarAdicionadas(adic);
    return msg;
  }

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
  if (carregarAdicionadas().includes(q)) salvarAdicionadas(cacheAdic);
  else persistir();
  return true;
}

function remover(titulo) {
  let n = 0;
  let l = carregar();
  const alvo = buscar(titulo);

  const restPacote = l.filter((x) => x.titulo !== titulo && !mesmoTitulo(x.titulo, titulo));
  if (restPacote.length !== l.length) {
    const tirada = l.find((x) => !restPacote.includes(x));
    if (tirada) registrarApagada("pacote", tirada);
    cache = restPacote;
    persistir();
    n++;
  }

  if (!n && alvo) {
    const adic = carregarAdicionadas();
    const restAdic = adic.filter((x) => x.titulo !== alvo.titulo);
    if (restAdic.length !== adic.length) {
      const tirada = adic.find((x) => !restAdic.includes(x));
      if (tirada) registrarApagada("adicionadas", tirada);
      salvarAdicionadas(restAdic);
      n++;
    }
  }
  return n;
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
      if (m.author.id === client.user.id && m.content.includes("Sumário")) apagar.push(m);
    }
    antes = lote.last().id;
  }
  for (const m of apagar) await m.delete().catch(() => {});
  return apagar.length;
}

function montarChunksSumario() {
  const lista = [...carregar(), ...carregarAdicionadas()].sort((a, b) =>
    a.titulo.localeCompare(b.titulo, "pt-BR")
  );
  const secoes = [];
  let letra = "";
  let atual = "";
  let ei = 0;
  for (const q of lista) {
    const inicial = (q.titulo.normalize("NFD").replace(/[^A-Za-zÀ-ÿ]/g, "").match(/[A-ZÀ-Ý]/) || ["#"])[0].toUpperCase();
    if (inicial !== letra) {
      if (atual) secoes.push(atual);
      letra = inicial;
      atual = `## ${EMOJIS_LETRA[ei % EMOJIS_LETRA.length]} — ${letra} —\n`;
      ei++;
    }
    const item = q.link ? `- [${q.titulo}](${q.link})` : `- ${q.titulo}`;
    if (atual.length + item.length > 1750) {
      secoes.push(atual);
      atual = `## ✳️ — ${letra} (cont.) —\n`;
    }
    atual += `${item}\n`;
  }
  if (atual) secoes.push(atual);

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
  return msgs.map((t, i) => {
    const cab =
      i === 0
        ? `# ${MARCADOR}! ﹒꒷₊⩇`
        : `*${MARCADOR}! ﹒꒷₊⩇ (${i + 1}/${msgs.length})*`;
    return `${cab}\n\n${t}`;
  });
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
  listarFandom,
  buscarFandom,
  informacao,
  sugerirNomes,
  acharCanal,
  acharMensagem,
  atualizarTexto,
  remover,
  reconstruirSumario,
};
