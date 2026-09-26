require("dotenv").config();
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { OWNER } = require("../src/perm");
const { embedsProjeto, embedsPC } = require("../src/commands/relatorio");

const tipo = process.argv[2] || "projeto";
const alvoId = process.argv[3] || OWNER;

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.User],
});

client.once("ready", async () => {
  try {
    const user = await client.users.fetch(alvoId);
    const embeds = tipo === "pc" ? await embedsPC() : embedsProjeto();
    await user.send({ embeds });
    console.log(`OK: ${embeds.length} embed(s) enviados pro ${user.tag} (${tipo})`);
  } catch (err) {
    console.log(`FALHOU: ${err.code || ""} ${err.message}`);
    console.log("Se for 50007, o bloqueio de privacidade ta ligado. Abre a DM da Neon pelo Discord e manda qualquer coisa.");
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(process.env.TOKEN);
