const { SlashCommandBuilder } = require("discord.js");
const { db } = require("../db");
const { log } = require("../logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("limparmemoria")
    .setDescription("Limpar memória de um usuário")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true)),
  adminOnly: true,
  async execute(interaction) {
    const alvo = interaction.options.getUser("usuario");
    if (!alvo) return interaction.reply({ content: "❌ usuário não encontrado.", ephemeral: true });
    if (db.data.users[alvo.id]) {
      if (!db.data.users[alvo.id].perfil) {
        db.data.users[alvo.id].perfil = { gostos: [], personalidade: [], observacoes: [] };
      }
      db.data.users[alvo.id].perfil.observacoes = [];
    }
    await db.write();
    log("INFO", "Memória limpa", { alvo: alvo.username, autor: interaction.user.username });
    return interaction.reply("🗑️ memória limpa.");
  },
};
