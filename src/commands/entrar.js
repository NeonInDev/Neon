const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("entrar")
    .setDescription("Faz a Neon entrar no seu canal de voz"),
  adminOnly: false,
  async execute(interaction) {
    const member = interaction.member;
    if (!member.voice.channel) {
      return interaction.reply("Você precisa estar em um canal de voz primeiro.");
    }

    const voz = require("../voz");
    const guildId = interaction.guildId;
    const channelId = member.voice.channelId;
    const adapter = interaction.guild.voiceAdapterCreator;

    await interaction.deferReply();

    const ok = await voz.entrarVoz(guildId, channelId, adapter);
    if (ok) {
      await interaction.editReply("✅ Conectada ao canal de voz! Já estou te ouvindo.");
    } else {
      await interaction.editReply("❌ Não consegui entrar no canal de voz.");
    }
  },
};
