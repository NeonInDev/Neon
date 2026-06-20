const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const { db } = require("../db");
const { getOrCreateUser } = require("../user");
const { log } = require("../logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("afinidade")
    .setDescription("Alterar afinidade de um usuário")
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
    .addIntegerOption((o) => o.setName("valor").setDescription("Novo valor (-1000 a 1000)").setRequired(true)),
  adminOnly: true,
  async execute(interaction) {
    const alvo = interaction.options.getUser("usuario");
    if (!alvo) return interaction.reply({ content: "❌ usuário não encontrado.", ephemeral: true });
    const valor = interaction.options.getInteger("valor");
    if (valor < -1000 || valor > 1000) {
      return interaction.reply({ content: "❌ valor deve estar entre -1000 e 1000.", ephemeral: true });
    }
    getOrCreateUser(db, alvo.id, alvo.username);
    db.data.users[alvo.id].afinidade = valor;
    await db.write();
    log("INFO", "Afinidade alterada", { alvo: alvo.username, valor, autor: interaction.user.username });
    return interaction.reply("✅ afinidade alterada.");
  },
};
