// Reler o forum "criacao" e atualizar o banco de poderes/dobras aprovadas
const { SlashCommandBuilder } = require("discord.js");
const poderes = require("../poderes");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("atualizar_poderes")
    .setDescription("Re-ler o fórum de criação e atualizar o banco de dobras aprovadas"),

  async execute(interaction) {
    await interaction.deferReply();
    const r = await poderes.atualizar(interaction.client);
    if (!r.ok) return await interaction.editReply(`❌ ${r.erro}`);
    await interaction.editReply(
      `✅ Poderes atualizados: **${r.aprovados}** aprovadas (${r.threads} threads no fórum, ${r.regras} exemplos de aprendizado).`
    );
  },
};
