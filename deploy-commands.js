require("dotenv").config();
const { REST, Routes } = require("discord.js");
const { readdirSync } = require("fs");
const { join } = require("path");

const commands = [];
const commandFiles = readdirSync(join(__dirname, "src", "commands")).filter(
  (f) => f.endsWith(".js") && f !== "index.js"
);

for (const file of commandFiles) {
  const command = require(join(__dirname, "src", "commands", file));
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log(`🔄 registrando ${commands.length} comandos...`);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("✅ comandos registrados.");
  } catch (err) {
    console.log("❌ erro no deploy:", err);
  }
})();
