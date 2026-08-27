// Re-ler os canais configurados e reconstruir o banco de lore
const { SlashCommandBuilder } = require("discord.js");
const lore = require("../lore");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("atualizar_lore")
    .setDescription("Re-ler os canais do servidor e atualizar o banco de lore"),

  async execute(interaction) {
    await interaction.deferReply();
    const r = await lore.atualizar(interaction.client);
    if (!r.ok) {
      return await interaction.editReply(`❌ ${r.erro}`);
    }
    await interaction.editReply(
      `✅ Lore atualizado: **${r.mensagens}** mensagens de ${r.canais} canais (${r.guild}).\n` +
        `Categorias: ${r.categorias.join(", ") || "nenhuma"}`
    );
  },
};
