const commands = require("../commands");
const { db } = require("../db");
const { log } = require("../logger");

module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    if (command.adminOnly) {
      const mestre = db.data.users?.[interaction.user.id];
      if (!mestre?.mestre) {
        return interaction.reply({ content: "❌ acesso negado.", ephemeral: true });
      }
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      log("ERROR", "Erro no comando", { cmd: interaction.commandName, erro: err.message });
      const payload = { content: "❌ erro interno", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
