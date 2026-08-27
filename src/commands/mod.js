const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ApplicationIntegrationType,
} = require("discord.js");

// cada subcomando exige sua propria permissao (nao todas de uma vez)
const PERM_SUB = {
  mute: PermissionFlagsBits.ModerateMembers,
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
};

function ehMod(interaction, sub) {
  return interaction.member.permissions.has(PERM_SUB[sub] || PermissionFlagsBits.ModerateMembers);
}

function checarAlvo(interaction, alvo, membro) {
  if (alvo.id === interaction.user.id) return "Você não pode fazer isso com você mesmo 😅";
  if (alvo.id === interaction.client.user.id) return "Eu prefiro não moderar a mim mesma 💜";
  // alvo pode nao estar mais no servidor (ban por ID) — nesses casos so checa hierarquia se der
  if (!membro) return null;
  if (
    interaction.member.roles.highest.comparePositionTo(membro.roles.highest) <= 0 &&
    interaction.guild.ownerId !== interaction.user.id
  ) {
    return "O cargo dele é igual ou maior que o seu.";
  }
  return null;
}

module.exports = {
  publico: true, // quem pode usar é definido pelo Discord (default_member_permissions), nao pela whitelist
  data: new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Ferramentas de moderação")
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers | PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers
    )
    .addSubcommand((sc) =>
      sc
        .setName("mute")
        .setDescription("Silencia um usuário por um tempo")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem silenciar").setRequired(true))
        .addIntegerOption((o) =>
          o
            .setName("minutos")
            .setDescription("Duração em minutos")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(40320)
        )
        .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setMaxLength(400))
    )
    .addSubcommand((sc) =>
      sc
        .setName("kick")
        .setDescription("Expulsa um usuário")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem expulsar").setRequired(true))
        .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setMaxLength(400))
    )
    .addSubcommand((sc) =>
      sc
        .setName("ban")
        .setDescription("Bane um usuário")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem banir").setRequired(true))
        .addIntegerOption((o) =>
          o
            .setName("apagar_dias")
            .setDescription("Apagar mensagens dos últimos X dias (0-7)")
            .setMinValue(0)
            .setMaxValue(7)
        )
        .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setMaxLength(400))
    )
    .addSubcommand((sc) =>
      sc
        .setName("apagar")
        .setDescription("Apaga as últimas mensagens deste canal")
        .addIntegerOption((o) =>
          o.setName("quantidade").setDescription("Quantas mensagens (2-100)").setRequired(true).setMinValue(2).setMaxValue(100)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "apagar") {
      const qtd = interaction.options.getInteger("quantidade");
      const precisa = PermissionFlagsBits.ManageMessages;
      if (!interaction.member.permissions.has(precisa)) {
        return await interaction.reply({ content: "🔒 Você precisa de Gerenciar Mensagens.", ephemeral: true });
      }
      if (
        !interaction.channel
          .permissionsFor(interaction.guild.members.me)
          ?.has([precisa, PermissionFlagsBits.ViewChannel])
      ) {
        return await interaction.reply({ content: "❌ Não tenho permissão aqui.", ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      try {
        const apagadas = await interaction.channel.bulkDelete(qtd, true);
        await interaction.editReply(`🧹 Apaguei **${apagadas.size}** mensagens.`);
      } catch (err) {
        await interaction.editReply(`❌ Apagar: ${err.message}`);
      }
      return;
    }

    if (!ehMod(interaction, sub)) {
      return await interaction.reply({ content: "🔒 Você não tem permissão de moderação pra isso.", ephemeral: true });
    }
    const alvo = interaction.options.getUser("usuario", true);
    const membro = await interaction.guild.members.fetch(alvo.id).catch(() => null);
    const motivo = interaction.options.getString("motivo") || "Sem motivo informado";
    await interaction.deferReply();

    try {
      if (sub === "mute") {
        const erro = checarAlvo(interaction, alvo, membro);
        if (erro) return await interaction.editReply(`❌ ${erro}`);
        if (!membro) return await interaction.editReply(`❌ **${alvo.tag}** não está mais no servidor.`);
        if (!membro.moderatable) return await interaction.editReply(`❌ Não consigo silenciar **${alvo.tag}** (cargo acima do meu).`);
        const mins = interaction.options.getInteger("minutos", true);
        await membro.timeout(mins * 60 * 1000, `${motivo} (por ${interaction.user.tag})`);
        return await interaction.editReply(
          `🔇 **${alvo.tag}** silenciado por **${mins} min**.\n📄 Motivo: ${motivo}`
        );
      }

      if (sub === "kick") {
        const erro = checarAlvo(interaction, alvo, membro);
        if (erro) return await interaction.editReply(`❌ ${erro}`);
        await membro.kick(`${motivo} (por ${interaction.user.tag})`);
        return await interaction.editReply(`👢 **${alvo.tag}** foi expulso.\n📄 Motivo: ${motivo}`);
      }

      if (sub === "ban") {
        const erro = checarAlvo(interaction, alvo, membro);
        if (erro) return await interaction.editReply(`❌ ${erro}`);
        const dias = interaction.options.getInteger("apagar_dias") || 0;
        await interaction.guild.members.ban(alvo.id, {
          deleteMessageSeconds: dias * 86400,
          reason: `${motivo} (por ${interaction.user.tag})`,
        });
        return await interaction.editReply(
          `🔨 **${alvo.tag}** foi banido.${dias ? ` Mensagens de ${dias}d apagadas.` : ""}\n📄 Motivo: ${motivo}`
        );
      }
    } catch (err) {
      await interaction.editReply(`❌ Mod: ${err.message}`);
    }
  },
};
