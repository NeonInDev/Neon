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
  ],
  partials: [Partials.Channel],
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
