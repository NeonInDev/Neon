// =============================================================
// BACKUP DO SERVIDOR (v2)
// -------------------------------------------------------------
// Os canais das categorias pedidas leem o CONTEUDO INTEIRO (todas as
// mensagens, paginadas). Todos os outros canais entram so com o NOME.
// Salva incrementalmente: se cair no meio, o que ja foi lido fica.
// =============================================================
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");

const GUILD = "1498162375251988624";
const ALVO = [
  "1498166870774386819",
  "1498165029499830343",
  "1498167645424586752",
  "1498211252311163022",
  "1498211919306297394",
  "1549542453969813505",
  "1498165870944452813",
];
const DIR = path.join(__dirname, "..", "data", "backup_new_genesis_v2");
const ARQ = path.join(DIR, "conteudo.json");
const PAUSA = 900; // ms entre requests, pra nao estourar o rate limit

fs.mkdirSync(DIR, { recursive: true });

function salvar(estado) {
  fs.writeFileSync(ARQ, JSON.stringify(estado, null, 2));
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function formatoMensagem(m) {
  return {
    id: m.id,
    autor: { id: m.author?.id, tag: m.author?.tag, username: m.author?.username, bot: !!m.author?.bot },
    data: m.createdAt?.toISOString(),
    editado: m.editedAt ? m.editedAt.toISOString() : null,
    tipo: m.type,
    conteudo: m.content || "",
    anexos: [...(m.attachments?.values?.() || [])].map((a) => ({
      nome: a.name,
      tipo: a.contentType,
      bytes: a.size,
      url: a.url,
    })),
    embeds: (m.embeds || []).map((e) => ({
      titulo: e.title || null,
      descricao: e.description || null,
      campos: (e.fields || []).map((f) => ({ nome: f.name, valor: f.value })),
      rodape: e.footer?.text || null,
    })),
    figurinhas: (m.stickers || []).map((s) => s.name),
    respostaA: m.reference?.messageId || null,
    fixado: !!m.pinned,
  };
}

// le todas as mensagens de um canal, pagina por pagina
async function lerCanal(ch, estado) {
  const msgs = [];
  let antes = null;
  let guardadas = 0;
  for (;;) {
    let page;
    try {
      page = await ch.messages.fetch({ limit: 100, before: antes });
    } catch (err) {
      if (err.code === 50013 || err.code === 10003) {
        console.log(`      sem permissao de leitura: ${err.code}`);
        break;
      }
      if (err.code === 429) {
        await dormir(Number(err.retryAfter || 2) * 1000 + 200);
        continue;
      }
      console.log(`      erro: ${err.message}`);
      break;
    }
    const lote = [...page.values()];
    if (!lote.length) break;
    for (const m of lote) msgs.push(formatoMensagem(m));
    guardadas += lote.length;
    antes = lote[lote.length - 1].id;
    if (lote.length < 100) break;
    if (guardadas % 1000 === 0) {
      estado.progresso = { canal: ch.name, guardadas };
      salvar(estado);
    }
    await dormir(PAUSA);
  }
  return msgs.reverse();
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  makeCache: () => new (require("discord.js").Collection)(),
});

client.once("clientReady", async () => {
  const g = client.guilds.cache.get(GUILD);
  if (!g) {
    console.log("guild nao encontrada");
    process.exit(1);
  }
  await g.channels.fetch().catch(() => {});

  const todos = [...g.channels.cache.values()];
  const comConteudo = new Map(); // channelId -> {categoria, categoriaNome}

  for (const id of ALVO) {
    const ch = g.channels.cache.get(id);
    if (!ch) {
      console.log(`aviso: ${id} nao encontrado`);
      continue;
    }
    if (ch.type === ChannelType.GuildCategory) {
      for (const f of todos.filter((x) => x.parentId === id)) {
        comConteudo.set(f.id, { categoria: id, categoriaNome: ch.name });
      }
    } else {
      comConteudo.set(ch.id, { categoria: id, categoriaNome: `avulso: ${ch.name}` });
    }
  }

  // --- nomes de TUDO (inclusive os que vao ter conteudo) ---
  const nomes = todos
    .filter((c) => c.type !== ChannelType.GuildCategory)
    .map((c) => ({
      id: c.id,
      nome: c.name,
      tipo: c.type,
      categoria: c.parentId || null,
      categoriaNome: c.parentId ? g.channels.cache.get(c.parentId)?.name || null : null,
      posicao: c.position,
      assunto: c.topic || null,
      temConteudo: comConteudo.has(c.id),
    }))
    .sort((a, b) => a.posicao - b.posicao);

  const categorias = todos
    .filter((c) => c.type === ChannelType.GuildCategory)
    .map((c) => ({
      id: c.id,
      nome: c.name,
      posicao: c.position,
      canais: todos.filter((x) => x.parentId === c.id).length,
      backupConteudo: ALVO.includes(c.id),
    }))
    .sort((a, b) => a.posicao - b.posicao);

  const estado = fs.existsSync(ARQ)
    ? JSON.parse(fs.readFileSync(ARQ, "utf8"))
    : { servidor: null, categorias, canaisNome: nomes, conteudo: {}, concluido: {} };

  estado.servidor = {
    nome: g.name,
    id: g.id,
    criadoEm: g.createdAt?.toISOString(),
    dono: g.ownerId,
    membros: g.memberCount,
    canais: todos.length,
    categorias: categorias.length,
    exportadoEm: new Date().toISOString(),
    idsComConteudo: ALVO,
  };
  estado.categorias = categorias;
  estado.canaisNome = nomes;
  estado.conteudo ||= {};
  estado.concluido ||= {};
  salvar(estado);

  console.log(`canais com nome: ${nomes.length} | com conteudo: ${comConteudo.size}\n`);

  const ordem = [...comConteudo.keys()];
  let i = 0;
  for (const id of ordem) {
    i++;
    const ch = g.channels.cache.get(id);
    const marca = comConteudo.get(id);
    if (estado.concluido[id] && fs.existsSync(ARQ) && estado.conteudo[id]?.length >= 0 && estado.concluido[id]) {
      console.log(`[${i}/${ordem.length}] ${ch?.name} (ja feito, ${estado.conteudo[id].length} msgs) - pulado`);
      continue;
    }
    process.stdout.write(`[${i}/${ordem.length}] ${ch?.name} ... `);
    if (!ch || !ch.isTextBased()) {
      console.log("tipo sem historico, so nome");
      estado.conteudo[id] = [];
      estado.concluido[id] = true;
      salvar(estado);
      continue;
    }
    const msgs = await lerCanal(ch, estado);
    estado.conteudo[id] = msgs;
    estado.concluido[id] = true;
    salvar(estado);
    console.log(`${msgs.length} mensagens`);

    // threads do forum/canal
    if (typeof ch.threads?.fetchActive === "function") {
      try {
        const th = await ch.threads.fetchActive();
        for (const t of th?.threads?.values?.() || []) {
          const tm = await lerCanal(t, estado);
          if (tm.length) {
            (estado.conteudo[`thread:${t.id}`] ||= []).push(...tm);
            estado.conteudo[`thread:${t.id}`].meta = {
              nome: t.name,
              canal: ch.name,
              criadoEm: t.createdAt?.toISOString(),
            };
            salvar(estado);
            console.log(`      └ thread "${t.name}": ${tm.length} msgs`);
          }
        }
      } catch {}
    }
    await dormir(PAUSA);
  }

  const total = Object.values(estado.conteudo)
    .filter((v) => Array.isArray(v))
    .reduce((s, v) => s + v.length, 0);
  estado.resumo = {
    canaisComNome: nomes.length,
    canaisComConteudo: ordem.length,
    mensagensTotais: total,
    finalizadoEm: new Date().toISOString(),
  };
  salvar(estado);
  console.log(`\nCONCLUIDO: ${total} mensagens em ${ordem.length} canais.`);
  console.log(`arquivo: ${ARQ}`);
  client.destroy();
  process.exit(0);
});

client.login(process.env.TOKEN);
setTimeout(() => {
  console.log("tempo esgotado, o que foi lido esta salvo");
  process.exit(1);
}, 1000 * 60 * 55);
