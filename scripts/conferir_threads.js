// Confere se sobrou mensagem do alvo em ALGUM lugar, incluindo threads
// ativas e arquivadas, que o scan por canal nao pegava.
require("dotenv").config();
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");

const GUILD = "1498162375251988624";
const ALVO = "1522880014419361842";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once("clientReady", async () => {
  const g = client.guilds.cache.get(GUILD);
  await g.channels.fetch().catch(() => {});
  const eu = await g.members.fetch(client.user.id);
  console.log(`bot ${client.user.tag} | ManageMessages: ${eu.permissions.has("ManageMessages")}`);

  // todas as threads ativas do servidor inteiro
  const ativas = await g.channels.fetchActiveThreads().catch((e) => {
    console.log(`erro ao listar threads: ${e.code || ""} ${e.message}`);
    return null;
  });
  if (!ativas) {
    console.log("\na API de threads nao respondeu. Vou listar pelo cache de cada canal de forum/texto.");
  }
  const lista = ativas?.threads ? [...ativas.threads] : [];
  console.log(`threads ativas pelo servidor: ${lista.length}`);

  // backup: busca thread por thread em cada canal pai, que devolve o
  // objeto completo (com historico). o fetchActiveThreads do servidor
  // traz um objeto cru, sem `messages`
  if (lista.length) {
    const porPai = new Map();
    for (const t of lista) {
      const pid = t.parentId || t.parent?.id || "?";
      if (!porPai.has(pid)) porPai.set(pid, []);
      porPai.get(pid).push(t);
    }
    const completas = [];
    for (const [pid, filhas] of porPai) {
      const pai = g.channels.cache.get(pid);
      if (!pai) {
        console.log(`  sem canal pai no cache para ${pid} (${filhas.length} threads)`);
        continue;
      }
      if (typeof pai.threads?.fetchActive !== "function") {
        console.log(`  pai ${pai.name} (${pai.type}) nao devolve threads`);
        continue;
      }
      const r = await pai.threads.fetchActive().catch((e) => {
        console.log(`  erro em ${pai.name}: ${e.code || ""} ${e.message}`);
        return null;
      });
      for (const th of r?.threads?.values?.() || []) {
        if (typeof th.messages?.fetch === "function") completas.push(th);
      }
    }
    console.log(`threads com historico acessivel pelo pai: ${completas.length}`);
    lista.length = 0;
    lista.push(...completas);
  }

  let achadas = [];
  let semAcesso = 0;
  for (const t of lista) {
    if (typeof t.messages?.fetch !== "function") {
      semAcesso++;
      continue;
    }
    let antes = null;
    for (;;) {
      const page = await t.messages.fetch({ limit: 100, before: antes }).catch(() => null);
      if (!page) break;
      const lote = [...page.values()];
      if (!lote.length) break;
      const minhas = lote.filter((m) => m.author?.id === ALVO);
      if (minhas.length) {
        achadas.push({ thread: t.name, parent: t.parent?.name || "?", total: minhas.length });
        for (const m of minhas) await m.delete().catch(() => {});
      }
      antes = lote[lote.length - 1].id;
      if (lote.length < 100) break;
      await dormir(400);
    }
  }

  if (achadas.length) {
    console.log("\n=== sobrou, e eu apaguei agora ===");
    for (const a of achadas) console.log(`  thread "${a.thread}" (em ${a.parent}): ${a.total} apagadas`);
  } else {
    console.log("\nnada sobrou nas threads ativas");
  }
  if (semAcesso) {
    const tipos = {};
    for (const t of lista) {
      if (typeof t.messages?.fetch === "function") continue;
      const nome = { 11: "thread publica", 12: "thread privada", 10: "thread de anuncio", 2: "voz" }[t.type] || `tipo ${t.type}`;
      tipos[nome] = (tipos[nome] || 0) + 1;
    }
    console.log(`\n${semAcesso} thread(s) sem historico visivel pra bot:`);
    for (const [k, v] of Object.entries(tipos)) console.log(`  ${k}: ${v}`);
    console.log("  (a API nao devolve o historico de thread que a bot nao participa)");
  }

  // canais de forum: as postagens nao tem historico proprio
  const forums = [...g.channels.cache.values()].filter((c) => c.type === ChannelType.GuildForum);
  console.log(`\nforuns no servidor: ${forums.length} (as postagens deles sao as threads acima)`);

  client.destroy();
  process.exit(0);
});

client.login(process.env.TOKEN);
setTimeout(() => process.exit(1), 1000 * 60 * 45);
