const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("conversar")
    .setDescription("Inicia ou para a conversa contínua no canal de voz")
    .addStringOption(opt =>
      opt.setName("modo")
        .setDescription("iniciar ou parar")
        .setRequired(true)
        .addChoices(
          { name: "iniciar", value: "iniciar" },
          { name: "parar", value: "parar" }
        )
    ),
  adminOnly: false,
  async execute(interaction) {
    const member = interaction.member;
    if (!member.voice.channel) {
      return interaction.reply("Você precisa estar em um canal de voz primeiro.");
    }

    const voz = require("../voz");
    const modo = interaction.options.getString("modo");

    if (modo === "iniciar") {
      await interaction.reply("A função de entrar em calls foi desativada.");
      return;
    } else {
      voz.pararConversa(interaction.guildId);
      await interaction.reply("⏹️ Conversa contínua parada.");
    }
  },
};
