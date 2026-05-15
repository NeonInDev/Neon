const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const { CLIENT_ID } = require("../config");

const PERMISSOES = 1024 + 2048 + 65536 + 32768;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("convidar")
    .setDescription("Adicionar a Neon no seu servidor ou perfil")
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
    const guildUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=${PERMISSOES}&integration_type=0&scope=bot%20applications.commands`;
    const userUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&integration_type=1&scope=applications.commands`;

    await interaction.reply({
      content:
        `📦 **Adicionar a Neon**\n\n` +
        `🏰 **Em servidor** (precisa de "Gerenciar Servidor")\n${guildUrl}\n\n` +
        `👤 **No seu perfil** (usa em qualquer DM)\n${userUrl}`,
      ephemeral: true,
    });
  },
};
