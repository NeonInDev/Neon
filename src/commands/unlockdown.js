// Unlockdown: desfazer um lockdown - restaurar os cargos e liberar a visão dos chats
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
    .setName("unlockdown")
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

    log("INFO", "[LOCKDOWN] Unlockdown", { autor: interaction.user.tag, alvo: alvo.tag });
    let texto = `✅ **${alvo.username}** liberado do lockdown.`;
    texto += `\n• Cargos devolvidos: **${r.cargosRestaurados}**`;
    if (r.cargosRecriados > 0) texto += `\n• Cargos que tinham sido deletados e foram recriados: **${r.cargosRecriados}**`;
    if (r.falhas && r.falhas.length) {
      texto += `\n⚠️ Alguns cargos não puderam ser devolvidos (${r.falhas.length}): converse com o admin.`;
    }
    texto += "\n• Permissões dos cargos restauradas junto.";
    await interaction.editReply(texto);
  },
};
