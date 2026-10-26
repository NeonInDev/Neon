const { SlashCommandBuilder } = require("discord.js");
const voiceId = require("../voz_id");
const voz = require("../voz");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("voz")
    .setDescription("Gerencia seu perfil de reconhecimento de voz")
    .addStringOption((option) => option
      .setName("acao")
      .setDescription("Ação para seu perfil de voz")
      .setRequired(true)
      .addChoices(
        { name: "cadastrar minha voz", value: "cadastrar" },
        { name: "ver status", value: "status" },
        { name: "apagar meu perfil", value: "apagar" },
        { name: "cancelar cadastro pendente", value: "cancelar" },
      )),
  adminOnly: false,
  async execute(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const action = interaction.options.getString("acao");

    if (!guildId) {
      return interaction.reply({ content: "Use este comando em um servidor do Discord.", ephemeral: true });
    }
    if (action === "status") {
      const exists = voiceId.temPerfil(userId);
      return interaction.reply({
        content: exists
          ? "✅ Seu perfil acústico está cadastrado. Ele serve para reconhecimento auxiliar; sua conta do Discord é usada para permissões."
          : "Você ainda não cadastrou um perfil acústico. Entre em um canal de voz e use `/voz acao:cadastrar`.",
        ephemeral: true,
      });
    }
    if (action === "apagar") {
      const removed = await voiceId.apagar(userId);
      return interaction.reply({
        content: removed ? "🗑️ Apaguei seu perfil acústico." : "Você não tinha um perfil acústico cadastrado.",
        ephemeral: true,
      });
    }
    if (action === "cancelar") {
      const cancelled = voz.cancelarCadastroVoz(guildId, userId);
      return interaction.reply({
        content: cancelled ? "Cadastro cancelado." : "Não havia cadastro de voz pendente.",
        ephemeral: true,
      });
    }

    const member = interaction.member;
    if (!member?.voice?.channel) {
      return interaction.reply({ content: "Entre em um canal de voz antes de cadastrar sua fala.", ephemeral: true });
    }
    const connected = await voz.entrarVoz(guildId, member.voice.channelId, interaction.guild.voiceAdapterCreator);
    if (!connected) {
      return interaction.reply({ content: "Não consegui entrar no seu canal de voz.", ephemeral: true });
    }
    voz.iniciarCadastroVoz(guildId, userId);
    return interaction.reply({
      content: "🎙️ Cadastro armado por até 2 minutos. Diga uma frase natural por 3–5 segundos; vou guardar somente um perfil acústico resumido, não o áudio. Use `/voz acao:cancelar` para cancelar.",
      ephemeral: true,
    });
  },
};
