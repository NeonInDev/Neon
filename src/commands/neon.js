const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const { askNeon } = require("../ai");
const { log } = require("../logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("neon")
    .setDescription("Falar com a Neon")
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel
    )
    .setIntegrationTypes(
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall
    )
    .addStringOption((o) => o.setName("mensagem").setDescription("Mensagem").setRequired(true)),
  async execute(interaction) {
    const texto = interaction.options.getString("mensagem");
    await interaction.deferReply();
    const reply = await askNeon(interaction.user.id, interaction.user.username, texto);
    log("INFO", "Comando /neon executado", { usuario: interaction.user.username, ctx: interaction.context, msg: texto.slice(0, 60) });
    await interaction.editReply(reply);
  },
};
