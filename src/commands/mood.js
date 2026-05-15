const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const { db } = require("../db");
const { log } = require("../logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mood")
    .setDescription("Alterar mood global")
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .addStringOption((o) => o.setName("tipo").setDescription("Novo mood").setRequired(true)),
  adminOnly: true,
  async execute(interaction) {
    db.data.globalMood = interaction.options.getString("tipo");
    await db.write();
    log("INFO", "Mood global alterado", { mood: db.data.globalMood, autor: interaction.user.username });
    return interaction.reply(`🧠 mood alterado para: ${db.data.globalMood}`);
  },
};
