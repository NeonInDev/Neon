const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("saude")
    .setDescription("Estado das APIs de IA da Neon")
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel
    )
    .setIntegrationTypes(
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall
    )
    .addStringOption((o) =>
      o.setName("modo").setDescription("O que mostrar (padrão: resumo)")
        .addChoices(
          { name: "resumo", value: "resumo" },
          { name: "detalhado", value: "detalhe" }
        )
    ),
  adminOnly: true,
  async execute(interaction) {
    const modo = interaction.options.getString("modo") || "resumo";
    await interaction.deferReply();
    const saude = require("../health_ai");
    const st = await saude.checar();
    const linhas = st.provedores.map((p) => {
      const emoji = p.ok === true ? "✅" : p.ok === false ? "❌" : "⚪";
      let txt = `${emoji} **${p.nome}**`;
      if (p.latencia != null) txt += ` — ${p.latencia}ms`;
      if (p.ok === false && modo === "detalhe") txt += `\n└ ${String(p.erro || "erro desconhecido").slice(0, 200)}`;
      return txt;
    });
    const cab = `🩺 **Saúde das APIs de IA**`;
    const rodape = st.provedores.some((p) => p.ok === false)
      ? "\n⚠️ Algum provedor está fora — a Neon usa a ordem Groq → OmniRoute → OpenRouter."
      : "";
    await interaction.editReply([cab, ...linhas, rodape].filter(Boolean).join("\n"));
  },
};