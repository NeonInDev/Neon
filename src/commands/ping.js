const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Medir a latência da Neon")
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel
    )
    .setIntegrationTypes(
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall
    ),
  async execute(interaction) {
    const enviada = await interaction.reply({ content: "🏓 medindo...", fetchReply: true });
    const ida = enviada.createdTimestamp - interaction.createdTimestamp;
    let ws = Math.round(interaction.client.ws.ping);
    if (!Number.isFinite(ws) || ws < 0) ws = null;
    const pior = ws ? Math.max(ida, ws) : ida;
    const humor =
      pior < 100 ? "⚡ turbo!" : pior < 250 ? "✨ de boa" : pior < 500 ? "😅 meio lenta" : "🥴 tá rasteando";
    const linhas = [`🏓 **Pong!** ${humor}`, `⚡ Mensagem: **${ida}ms**`];
    if (ws) linhas.push(`💓 WebSocket: **${ws}ms**`);
    await interaction.editReply(linhas.join("\n"));
  },
};
