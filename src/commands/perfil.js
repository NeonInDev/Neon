const { SlashCommandBuilder } = require("discord.js");
const { db } = require("../db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("perfil")
    .setDescription("Ver perfil de um usuário")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true)),
  adminOnly: true,
  async execute(interaction) {
    const alvo = interaction.options.getUser("usuario");
    if (!alvo) return interaction.reply({ content: "❌ usuário não encontrado.", ephemeral: true });
    const data = db.data.users[alvo.id];
    if (!data) return interaction.reply("❌ sem dados.");
    if (!data.perfil) data.perfil = { gostos: [], personalidade: [], observacoes: [] };
    return interaction.reply(
      [
        `🧠 Perfil de ${alvo.username}`,
        ``,
        `Afinidade: ${data.afinidade || 0}`,
        `Apelido: ${data.apelido || "nenhum"}`,
        `Gostos: ${data.perfil.gostos.join(", ") || "nenhum"}`,
        `Personalidade: ${data.perfil.personalidade.join(", ") || "nenhuma"}`,
        `Memórias: ${data.perfil.observacoes.join(", ") || "nenhuma"}`,
      ].join("\n")
    );
  },
};
