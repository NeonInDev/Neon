const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { readdirSync } = require("fs");
const { join } = require("path");
const { log } = require("./logger");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildBans,
  ],
  // GuildMember e obrigatorio: em servidores grandes (>250) o Discord faz
  // lazy loading de membros e, sem o partial, message.member chega null
  // (quebrava os comandos por fala natural com "reading 'permissions'").
  partials: [Partials.Channel, Partials.GuildMember],
});

const eventFiles = readdirSync(join(__dirname, "events")).filter((f) => f.endsWith(".js"));
for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) client.once(event.name, (...args) => event.execute(...args));
  else client.on(event.name, (...args) => event.execute(...args));
}

client.on("error", (err) => log("ERROR", "Erro na conexão do Discord", { erro: err.message }));
client.on("warn", (msg) => log("WARN", msg));

module.exports = { client };
