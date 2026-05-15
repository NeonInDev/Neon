const { SlashCommandBuilder } = require("discord.js");
const { CLIENT_ID } = require("../config");

const PERMISSOES = 1024 + 2048 + 65536 + 32768;
const URL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=${PERMISSOES}&scope=bot%20applications.commands`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("convidar")
    .setDescription("Link para adicionar a Neon em qualquer servidor"),
  async execute(interaction) {
    await interaction.reply(
      `📦 **Adicione a Neon no seu servidor**\n\n` +
      `${URL}\n\n` +
      `_Requer permissão "Gerenciar Servidor" no servidor de destino._`
    );
  },
};
