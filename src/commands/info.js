// Consultar o lore do servidor de RP (aberto a todos)
const { SlashCommandBuilder } = require("discord.js");
const { EmbedBuilder } = require("discord.js");
const lore = require("../lore");

module.exports = {
  publico: true,
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("Consultar informações do lore do servidor (indexado dos canais)")
    .addStringOption((o) =>
      o.setName("termo").setDescription("O que você quer saber (ex.: 'reino de Avelda')").setRequired(true)
    ),

  async execute(interaction) {
    const termo = interaction.options.getString("termo");
    const r = lore.buscar(termo);
    if (!r.ok) {
      return await interaction.reply({ content: `❌ ${r.erro}`, ephemeral: true });
    }
    if (!r.resultados.length) {
      return await interaction.reply(
        `❌ Nada encontrado para "${termo}". Tenta outro termo, ou rode /atualizar_lore se o banco está vazio.`
      );
    }

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`📖 "${termo}"`)
      .setDescription(`${r.total} referência${r.total > 1 ? "s" : ""} encontrada${r.total > 1 ? "s" : ""}.`);

    for (const res of r.resultados.slice(0, 4)) {
      const trecho = res.trecho.length > 1000 ? res.trecho.slice(0, 997) + "…" : res.trecho;
      embed.addFields({
        name: `${res.categoria} / ${res.canal} — ${res.autor}`,
        value: `>>> ${trecho}`,
      });
    }

    return await interaction.reply({ embeds: [embed] });
  },
};
