const {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("id")
    .setDescription("Pegar IDs de usuários, mensagens e canais")
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel
    )
    .setIntegrationTypes(
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall
    )
    .addSubcommand((sc) =>
      sc
        .setName("usuario")
        .setDescription("ID de um usuário")
        .addUserOption((o) => o.setName("alvo").setDescription("Usuário (vazio = você)"))
    )
    .addSubcommand((sc) =>
      sc
        .setName("mensagem")
        .setDescription("IDs de uma mensagem a partir do link (copiar link da mensagem)")
        .addStringOption((o) => o.setName("link").setDescription("Link da mensagem").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("canal")
        .setDescription("ID deste ou de outro canal")
        .addChannelOption((o) => o.setName("alvo").setDescription("Canal (vazio = este)"))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "usuario") {
      const alvo = interaction.options.getUser("alvo") || interaction.user;
      const membro =
        interaction.inGuild() && alvo.id !== interaction.user.id
          ? await interaction.guild.members.fetch(alvo.id).catch(() => null)
          : null;
      const linhas = [
        `🆔 **${alvo.tag}**`,
        `\`\`\`${alvo.id}\`\`\``,
        `📅 Conta criada: <t:${Math.floor(alvo.createdTimestamp / 1000)}:d>`,
      ];
      if (membro) linhas.push(`🚪 Entrou: <t:${Math.floor(membro.joinedTimestamp / 1000)}:d>`);
      return await interaction.reply(linhas.join("\n"));
    }

    if (sub === "mensagem") {
      await interaction.deferReply({ ephemeral: true });
      const m = interaction.options.getString("link", true).match(/discord(?:\.com|app)?\/channels\/(\d+)\/(\d+)\/(\d+)/);
      if (!m) return await interaction.editReply("❌ Isso não parece um link de mensagem do Discord.");
      const [, guilda, canal, msgId] = m;
      let conteudo = "";
      try {
        const ch = await interaction.client.channels.fetch(canal);
        const msg = await ch.messages.fetch(msgId);
        conteudo = `\n📝 Autor: ${msg.author.tag}\n📄 \`${(msg.content || "(sem texto)").slice(0, 200)}\``;
      } catch {}
      return await interaction.editReply(
        [
          `🧭 Servidor: \`${guilda}\``,
          `#️⃣ Canal: \`${canal}\``,
          `💬 Mensagem: \`${msgId}\`${conteudo}`,
        ].join("\n")
      );
    }

    if (sub === "canal") {
      const canal = interaction.options.getChannel("alvo") || interaction.channel;
      return await interaction.reply(`#️⃣ **#${canal.name}**\n\`\`\`${canal.id}\`\`\``);
    }
  },
};
