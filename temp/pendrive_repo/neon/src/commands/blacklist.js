const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const { db } = require("../db");
const { log } = require("../logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Adicionar usuário à blacklist")
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true)),
  adminOnly: true,
  async execute(interaction) {
    const alvo = interaction.options.getUser("usuario");
    if (!alvo) return interaction.reply({ content: "❌ usuário não encontrado.", ephemeral: true });
    if (!db.data.blacklist.includes(alvo.id)) db.data.blacklist.push(alvo.id);
    await db.write();
    log("INFO", "Usuário adicionado à blacklist", { alvo: alvo.username, autor: interaction.user.username });
    return interaction.reply(`🚫 ${alvo.username} foi colocado na blacklist.`);
  },
};
