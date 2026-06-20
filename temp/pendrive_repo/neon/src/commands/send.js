const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const { log } = require("../logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("send")
    .setDescription("Enviar mensagem para alguém no Discord")
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel
    )
    .setIntegrationTypes(
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall
    )
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário alvo").setRequired(true))
    .addStringOption((o) => o.setName("mensagem").setDescription("Conteúdo da mensagem").setRequired(true)),
  async execute(interaction) {
    const alvo = interaction.options.getUser("usuario");
    const conteudo = interaction.options.getString("mensagem");
    await interaction.deferReply({ ephemeral: true });
    try {
      await alvo.send(`💬 **Neon:** ${conteudo}`);
      await interaction.editReply({ content: `✅ Mensagem enviada para **${alvo.username}**.`, ephemeral: true });
      log("INFO", "Comando /send executado", { de: interaction.user.username, para: alvo.username });
    } catch (err) {
      await interaction.editReply({ content: `❌ Não consegui enviar DM para ${alvo.username}: ${err.message}`, ephemeral: true });
    }
  },
};
