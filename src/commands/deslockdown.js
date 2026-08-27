// Desfazer um lockdown: restaurar os cargos e liberar a visão dos chats
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ApplicationIntegrationType,
} = require("discord.js");
const { log } = require("../logger");
const { desativaLockdown } = require("../lockdown");

function ehMod(interaction) {
  return (
    interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)
  );
}

module.exports = {
  publico: true, // permissão controlada pelo Discord (ModerateMembers) + checagem aqui
  data: new SlashCommandBuilder()
    .setName("deslockdown")
    .setDescription("Liberar um usuário do lockdown e restaurar os cargos")
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("usuario").setDescription("Quem sair do lockdown").setRequired(true)),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "❌ Isso só funciona em servidores.", ephemeral: true });
    }
    if (!ehMod(interaction)) {
      return interaction.reply({ content: "🔒 Você não tem permissão de moderação.", ephemeral: true });
    }

    const alvo = interaction.options.getUser("usuario");
    if (alvo.id === interaction.client.user.id) return interaction.reply({ content: "😅", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const r = await desativaLockdown(interaction.guild, alvo.id);
    if (!r.ok) {
      return interaction.editReply(`❌ ${r.erro}`);
    }

    log("INFO", "[LOCKDOWN] Deslockdown", { autor: interaction.user.tag, alvo: alvo.tag });
    await interaction.editReply(`✅ **${alvo.username}** liberado do lockdown. Cargos restaurados.`);
  },
};
