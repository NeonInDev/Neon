const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const { db } = require("../db");
const { getOrCreateUser } = require("../user");
const { log } = require("../logger");

const MAX_OBSERVACOES = 200;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("memoria")
    .setDescription("Adicionar memória a um usuário")
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
    .addStringOption((o) => o.setName("texto").setDescription("Texto da memória").setRequired(true)),
  adminOnly: true,
  async execute(interaction) {
    const alvo = interaction.options.getUser("usuario");
    if (!alvo) return interaction.reply({ content: "❌ usuário não encontrado.", ephemeral: true });
    const texto = interaction.options.getString("texto");
    const user = getOrCreateUser(db, alvo.id, alvo.username);
    if (user.perfil.observacoes.length >= MAX_OBSERVACOES) user.perfil.observacoes.shift();
    user.perfil.observacoes.push(texto);
    await db.write();
    log("INFO", "Memória adicionada", { alvo: alvo.username, autor: interaction.user.username });
    return interaction.reply("🧠 memória adicionada.");
  },
};
