const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const { db } = require("../db");
const { getOrCreateUser } = require("../user");
const { log } = require("../logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("personalidade")
    .setDescription("Registrar traço de personalidade")
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
    .addStringOption((o) => o.setName("texto").setDescription("Traço de personalidade").setRequired(true)),
  adminOnly: true,
  async execute(interaction) {
    const alvo = interaction.options.getUser("usuario");
    if (!alvo) return interaction.reply({ content: "❌ usuário não encontrado.", ephemeral: true });
    const texto = interaction.options.getString("texto");
    const user = getOrCreateUser(db, alvo.id, alvo.username);
    if (user.perfil.personalidade.includes(texto)) {
      return interaction.reply({ content: "❌ já registrado.", ephemeral: true });
    }
    user.perfil.personalidade.push(texto);
    await db.write();
    log("INFO", "Traço de personalidade registrado", { alvo: alvo.username, autor: interaction.user.username });
    return interaction.reply("✅ traço registrado.");
  },
};
