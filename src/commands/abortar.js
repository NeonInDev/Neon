const { SlashCommandBuilder } = require("discord.js");
const { isOwner } = require("../perm");
const opencode = require("../../plugins/opencode");
const { limpar } = require("../fila");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("abortar")
    .setDescription("Interromper o processamento atual da Neon"),
  async execute(interaction) {
    if (!isOwner(interaction.user.id)) {
      await interaction.reply({ content: "❌ Apenas o chefe pode abortar tarefas.", ephemeral: true });
      return;
    }
    opencode.parar();
    limpar(interaction.user.id);
    await interaction.reply("🛑 Processamento abortado e fila limpa.");
  },
};
