// =============================================================
// APAGAR AS MENSAGENS DE UM USUARIO
// -------------------------------------------------------------
// Discord so deixa apagar em lote mensagens com menos de 14 dias.
// As mais velhas precisam ser apagadas uma por uma, entao o script faz
// os dois caminhos.
//
// uso: node scripts/apagar_msgs_usuario.js <userId> [--executar]
//      sem --executar ele so conta
// =============================================================
require("dotenv").config();
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");

const GUILD = "1498162375251988624";
const EXECUTAR = process.argv.includes("--executar");
const ALVO = process.argv[2];
const LIMITE_MS = 14 * 24 * 60 * 60 * 1000;
const PAUSA = 800;

if (!ALVO) {
  console.log("uso: node scripts/apagar_msgs_usuario.js <userId> [--executar]");
  process.exit(1);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once("clientReady", async () => {
  const g = client.guilds.cache.get(GUILD);
  if (!g) {
    console.log("guild nao encontrada");
    process.exit(1);
  }
  const eu = await g.members.fetch(client.user.id);
  if (!eu.permissions.has("ManageMessages")) {
    console.log("a bot NAO tem Gerenciar Mensagens nesse servidor, nao da pra apagar");
    process.exit(1);
  }
  console.log(`bot: ${client.user.tag} | ManageMessages ok`);

  // nome do alvo, so pra conferir que e a pessoa certa
  let alvoTag = ALVO;
  try {
    const u = await client.users.fetch(ALVO);
    alvoTag = u.tag;
  } catch {
    console.log("aviso: nao consegui puxar o usuario do cache (pode ter saído do servidor)");
  }
  console.log(`alvo: ${alvoTag} (${ALVO})`);
  console.log(`modo: ${EXECUTAR ? "APAGAR" : "só contar"}\n`);

  await g.channels.fetch().catch(() => {});
  const canais = [...g.channels.cache.values()].filter(
    (c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement || c.type === ChannelType.PublicThread,
  );
  console.log(`canais de texto: ${canais.length}\n`);

  let totalAchei = 0;
  let deletados = 0;
  let porCanal = 0;
  const onde = [];
  const erros = [];

  for (const ch of canais) {
    let antes = null;
    let doUsuario = [];
    for (;;) {
      let page;
      try {
        page = await ch.messages.fetch({ limit: 100, before: antes });
      } catch {
        break;
      }
      const lote = [...page.values()];
      if (!lote.length) break;
      for (const m of lote) if (m.author?.id === ALVO) doUsuario.push(m);
      antes = lote[lote.length - 1].id;
      if (lote.length < 100) break;
      await dormir(PAUSA / 2);
    }
    if (!doUsuario.length) continue;

    totalAchei += doUsuario.length;
    porCanal++;
    const velhas = doUsuario.filter((m) => Date.now() - m.createdTimestamp > LIMITE_MS);
    const novas = doUsuario.filter((m) => Date.now() - m.createdTimestamp <= LIMITE_MS);
    onde.push({ canal: ch.name, id: ch.id, total: doUsuario.length, novas: novas.length, velhas: velhas.length });

    if (!EXECUTAR) continue;

    // 1) as recentes em lote (100 por vez, 2 semanas de janela)
    for (let i = 0; i < novas.length; i += 100) {
      const pedaco = novas.slice(i, i + 100);
      try {
        await ch.bulkDelete(pedaco, true);
        deletados += pedaco.length;
      } catch (err) {
        // se o lote falhar, vai uma por uma
        for (const m of pedaco) {
          try {
            await m.delete();
            deletados++;
          } catch (e) {
            if (e.code !== 10008) erros.push(`${ch.name}: ${e.message}`);
          }
          await dormir(200);
        }
      }
      await dormir(PAUSA);
    }

    // 2) as antigas, uma por uma (lote nao vale)
    for (const m of velhas) {
      try {
        await m.delete();
        deletados++;
      } catch (err) {
        if (err.code !== 10008) erros.push(`${ch.name}: ${err.message}`);
      }
      await dormir(250);
    }
    console.log(`  ${ch.name}: ${doUsuario.length} apagadas (${novas.length} lote, ${velhas.length} antigas)`);
  }

  console.log(`\n=== resultado ===`);
  console.log(`canais com mensagem do alvo: ${porCanal}`);
  console.log(`mensagens encontradas:       ${totalAchei}`);
  console.log(`mensagens apagadas:          ${deletados}`);
  if (EXECUTAR && deletados < totalAchei) {
    console.log(`\nficaram ${totalAchei - deletados} para apagar (rode de novo)`);
  }
  if (erros.length) {
    console.log(`\nproblemas (${erros.length}):`);
    for (const e of [...new Set(erros)].slice(0, 8)) console.log(`  - ${e}`);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.TOKEN);
setTimeout(() => {
  console.log("tempo esgotado");
  process.exit(1);
}, 1000 * 60 * 50);
