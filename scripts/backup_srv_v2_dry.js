// Resolve os IDs pedidos: categoria -> filhos, ou canal avulso.
require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const GUILD = "1498162375251988624";
const PEDIDOS = [
  "1498166870774386819",
  "1498165029499830343",
  "1498167645424586752",
  "1498211252311163022",
  "1498211919306297394",
  "1549542453969813505",
  "1498165870944452813",
];

const c = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

c.once("ready", async () => {
  const g = c.guilds.cache.get(GUILD);
  if (!g) return console.log("guild nao encontrada"), process.exit(1);
  await g.channels.fetch().catch(() => {});

  const todos = [...g.channels.cache.values()];
  const comConteudo = new Set();
  console.log("=== o que cada ID é ===");
  for (const id of PEDIDOS) {
    const ch = g.channels.cache.get(id);
    if (!ch) {
      console.log(`  ${id} -> NAO ENCONTRADO (pode ser categoria com filhos ainda nao cache)`);
      continue;
    }
    const tipo = ch.type === 4 ? "CATEGORIA" : "CANAL";
    console.log(`  ${id} -> ${tipo}: ${ch.name}`);
    if (ch.type === 4) {
      const filhos = todos.filter((x) => x.parentId === id);
      console.log(`       ${filhos.length} canais dentro:`);
      for (const f of filhos.sort((a, b) => a.position - b.position)) {
        comConteudo.add(f.id);
        console.log(`         - ${f.name} (${f.id}) ${f.type === 0 ? "texto" : "outro:" + f.type}`);
      }
    } else {
      comConteudo.add(ch.id);
    }
  }

  const outros = todos.filter((x) => !comConteudo.has(x.id));
  console.log(`\n=== resumo ===`);
  console.log(`canais no servidor:      ${todos.length}`);
  console.log(`vão receber CONTEÚDO:    ${comConteudo.size}`);
  console.log(`vão receber só o NOME:   ${outros.length}`);
  c.destroy();
  process.exit(0);
});

c.login(process.env.TOKEN);
setTimeout(() => process.exit(1), 60000);
