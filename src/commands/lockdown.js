// Lockdown: remove todos os cargos do usuário e bloqueia a visão dos chats
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ApplicationIntegrationType,
} = require("discord.js");
const { log } = require("../logger");
const { ativaLockdown, listarAtivos } = require("../lockdown");

function ehMod(interaction) {
  return (
    interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)
  );
}

function checarAlvo(interaction, alvo, membro) {
  if (alvo.id === interaction.user.id) return "Você não pode dar lockdown em si mesmo 😅";
  if (alvo.id === interaction.client.user.id) return "Prefiro não fazer isso comigo mesma 💜";
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
  publico: true, // permissão controlada pelo Discord (ModerateMembers) + checagem aqui
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Remover todos os cargos e bloquear os chats de um usuário")
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("usuario").setDescription("Quem vai pro lockdown").setRequired(true))
    .addNumberOption((o) =>
      o
        .setName("horas")
        .setDescription("Duração em horas (opcional). Sem isso, espera /unlockdown.")
        .setMinValue(0.1)
        .setMaxValue(168)
    )
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo (registrado nos logs)")),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "❌ Isso só funciona em servidores.", ephemeral: true });
    }
    if (!ehMod(interaction)) {
      return interaction.reply({ content: "🔒 Você não tem permissão de moderação.", ephemeral: true });
    }
    const alvo = interaction.options.getUser("usuario");
    const membro = await interaction.guild.members.fetch(alvo.id).catch(() => null);
    const problema = checarAlvo(interaction, alvo, membro);
    if (problema) return interaction.reply({ content: `❌ ${problema}`, ephemeral: true });

    const horas = interaction.options.getNumber("horas");
    const motivo = interaction.options.getString("motivo") || null;
    const expiraEm = horas ? Date.now() + horas * 3600 * 1000 : null;

    await interaction.deferReply({ ephemeral: true });
    const r = await ativaLockdown(membro, motivo, expiraEm);
    if (!r.ok) {
      return interaction.editReply(`❌ ${r.erro}`);
    }

    log("INFO", "[LOCKDOWN] Comando", {
      autor: interaction.user.tag,
      alvo: alvo.tag,
      horas,
      motivo,
    });

    let texto = `🔒 **${alvo.username}** está em lockdown (removidos temporariamente).\n• Cargos removidos: ${r.cargosSalvos} (serão devolvidos no release)\n• Canais bloqueados: ${r.canaisAfetados}`;
    if (expiraEm) {
      const quando = new Date(expiraEm).toLocaleString("pt-BR");
      texto += `\n• Libera automaticamente em: **${quando}**`;
    } else {
      texto += "\n• Soltura manual com `/unlockdown` (devolve os cargos).";
    }
    await interaction.editReply(texto);
  },
};
