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
        `> **Convide a Neon para seu servidor ou perfil**\n\n` +
        `**Servidor** — requer "Gerenciar Servidor"\n` +
        `[Clique aqui para adicionar em um servidor](${guildUrl})\n\n` +
        `**Perfil** — instala como app de usuário, usa \`/neon\` em qualquer DM\n` +
        `[Clique aqui para adicionar ao seu perfil](${userUrl})`,
    });
  },
};
