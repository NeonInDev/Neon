const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const { db } = require("../db");
const { getOrCreateUser } = require("../user");
const { log } = require("../logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("gostos")
    .setDescription("Registrar gosto para um usuário")
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
    .addStringOption((o) => o.setName("texto").setDescription("O que o usuário gosta").setRequired(true)),
  adminOnly: true,
  async execute(interaction) {
    const alvo = interaction.options.getUser("usuario");
    if (!alvo) return interaction.reply({ content: "❌ usuário não encontrado.", ephemeral: true });
    const texto = interaction.options.getString("texto");
    const user = getOrCreateUser(db, alvo.id, alvo.username);
    if (user.perfil.gostos.includes(texto)) {
      return interaction.reply({ content: "❌ já registrado.", ephemeral: true });
    }
    user.perfil.gostos.push(texto);
    await db.write();
    log("INFO", "Gosto registrado", { alvo: alvo.username, autor: interaction.user.username });
    return interaction.reply("✅ gosto registrado.");
  },
};
