const { SlashCommandBuilder } = require("discord.js");
const { db } = require("../db");
const { getOrCreateUser } = require("../user");
const { log } = require("../logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("apelido")
    .setDescription("Alterar apelido de um usuário")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
    .addStringOption((o) => o.setName("apelido").setDescription("Novo apelido").setRequired(true)),
  adminOnly: true,
  async execute(interaction) {
    const alvo = interaction.options.getUser("usuario");
    if (!alvo) return interaction.reply({ content: "❌ usuário não encontrado.", ephemeral: true });
    const apelido = interaction.options.getString("apelido");
    if (apelido.length > 50) {
      return interaction.reply({ content: "❌ apelido muito longo (máx 50).", ephemeral: true });
    }
    getOrCreateUser(db, alvo.id, alvo.username);
    db.data.users[alvo.id].apelido = apelido;
    await db.write();
    log("INFO", "Apelido alterado", { alvo: alvo.username, apelido, autor: interaction.user.username });
    return interaction.reply("✅ apelido alterado.");
  },
};
