const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const { askNeon } = require("../ai");
const { executarAcao } = require("../actions");
const { db } = require("../db");
const { getOrCreateUser } = require("../user");
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

    // Tenta executar ação primeiro (Spotify, YouTube, DM, etc)
    getOrCreateUser(db, interaction.user.id, interaction.user.username);
    const mestre = db.data.users?.[interaction.user.id]?.mestre || false;
    const resultadoAcao = await executarAcao(texto, mestre, interaction.user.id);
    if (resultadoAcao && !resultadoAcao.startsWith("❌")) {
      await interaction.editReply(resultadoAcao);
      return;
    }

    // Fallback: IA
    const reply = await askNeon(interaction.user.id, interaction.user.username, texto);
    log("INFO", "Comando /neon executado", { usuario: interaction.user.username, ctx: interaction.context, msg: texto.slice(0, 60) });
    await interaction.editReply(reply);
  },
};
