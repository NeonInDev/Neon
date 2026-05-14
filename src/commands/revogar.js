const { SlashCommandBuilder } = require("discord.js");
const { db } = require("../db");
const { log } = require("../logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("revogar")
    .setDescription("Revogar acesso mestre de um usuário")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true)),
  adminOnly: true,
  async execute(interaction) {
    const alvo = interaction.options.getUser("usuario");
    if (!alvo) return interaction.reply({ content: "❌ usuário não encontrado.", ephemeral: true });
    if (alvo.id === interaction.user.id) {
      return interaction.reply({ content: "❌ você não pode revogar o próprio acesso.", ephemeral: true });
    }
    if (db.data.users[alvo.id]) db.data.users[alvo.id].mestre = false;
    await db.write();
    log("INFO", "Acesso mestre revogado", { alvo: alvo.username, autor: interaction.user.username });
    return interaction.reply(`✅ acesso de ${alvo.username} revogado.`);
  },
};
