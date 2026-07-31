const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sair")
    .setDescription("Faz a Neon sair do canal de voz"),
  adminOnly: false,
  async execute(interaction) {
    const voz = require("../voz");
    const guildId = interaction.guildId;

    const ok = voz.sairVoz(guildId);
    if (ok) {
      await interaction.reply("👋 Saí do canal de voz.");
    } else {
      await interaction.reply("Não estou em nenhum canal de voz.");
    }
  },
};
