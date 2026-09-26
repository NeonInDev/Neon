const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

const gravador = require("../gravador");

function linhaStatus(s) {
  const linhas = [
    `🎙️ **Gravador de call** — ${s.ativo ? "ligado" : "desligado"}`,
    `Canal de staff (não grava): ${s.canalStaffId ? `<#${s.canalStaffId}>` : "*não definido*"}`,
    `Warn automático: ${s.aplicandoWarn ? "sim" : "não"}${s.mutedSegundos ? ` + mute de ${s.mutedSegundos}s` : ""}`,
    s.gravandoAgora
      ? `Gravando agora: <#${s.gravandoAgora}> (${s.pessoa} pessoa(s))`
      : "Gravando agora: *nenhum canal*",
    `Pastas: \`${s.pasta}\``,
  ];
  return linhas.join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("gravar")
    .setDescription("A Neon grava as calls fora do canal de staff e pune palavra proibida")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sc) =>
      sc.setName("status").setDescription("Mostra o que está sendo gravado agora")
    )
    .addSubcommand((sc) =>
      sc.setName("ligar").setDescription("Liga a gravação automática das calls")
    )
    .addSubcommand((sc) =>
      sc.setName("desligar").setDescription("Desliga a gravação automática")
    )
    .addSubcommand((sc) =>
      sc
        .setName("canal")
        .setDescription("Define o canal de staff, que nunca é gravado")
        .addChannelOption((o) =>
          o
            .setName("staff")
            .setDescription("Canal de voz da staff (ou nenhum para gravar em todo lugar)")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("ajustar")
        .setDescription("Ajusta punição e limpeza dos arquivos")
        .addBooleanOption((o) => o.setName("warn").setDescription("Aplicar warn em palavra proibida"))
        .addIntegerOption((o) =>
          o
            .setName("mute")
            .setDescription("Segundos de mute junto com o warn (0 = só aviso)")
            .setMinValue(0)
            .setMaxValue(40320)
        )
        .addBooleanOption((o) => o.setName("guardar_limpo").setDescription("Guardar áudio sem infração"))
    )
    .addSubcommand((sc) =>
      sc
        .setName("ver")
        .setDescription("Mostra as últimas transcrições")
        .addIntegerOption((o) => o.setName("quantidade").setDescription("Quantas mostrar (padrão 10)").setMinValue(1).setMaxValue(25))
    ),

  publico: true,
  adminOnly: true,

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const g = interaction.guild;
    const cfg = gravador.CFG;

    if (sub === "status") {
      return interaction.reply({ content: linhaStatus(gravador.status(g.id)), ephemeral: true });
    }

    if (sub === "ligar") {
      await interaction.deferReply();
      await gravador.ligar(g.id);
      return interaction.editReply(linhaStatus(gravador.status(g.id)));
    }

    if (sub === "desligar") {
      gravador.desligar(g.id);
      return interaction.reply(linhaStatus(gravador.status(g.id)));
    }

    if (sub === "canal") {
      const canal = interaction.options.getChannel("staff");
      gravador.definirCanalStaff(g.id, canal?.id || null);
      return interaction.reply(
        canal
          ? `✅ Staff definida para <#${canal.id}>. Essa call **não** é gravada.`
          : "✅ Staff desmarcada. Agora todas as calls são gravadas."
      );
    }

    if (sub === "ajustar") {
      const w = interaction.options.getBoolean("warn");
      const m = interaction.options.getInteger("mute");
      const gl = interaction.options.getBoolean("guardar_limpo");
      if (w !== null) cfg.aplicarWarn = w;
      if (m !== null) cfg.mutedSegundos = m;
      if (gl !== null) cfg.apagarLimpo = !gl;
      gravador.salvar();
      return interaction.reply(linhaStatus(gravador.status(g.id)));
    }

    if (sub === "ver") {
      const n = interaction.options.getInteger("quantidade") || 10;
      const itens = (gravador.sessoes?.get(g.id)?.itens) || [];
      if (!itens.length) {
        return interaction.reply({ content: "Nada gravado nesta sessão ainda.", ephemeral: true });
      }
      const ultimos = itens.slice(-n).reverse();
      const texto = ultimos
        .map((it) => {
          const marca = it.punido ? "🔨 punido" : it.violacoes?.length ? "⚠️ infração" : "ok";
          const audio = it.audio ? `\n🎧 \`${it.audio}\`` : "";
          return `**${it.tag}** em ${it.canalNome} — ${(it.ms / 1000).toFixed(1)}s — ${marca}\n> ${(it.transcricao || "(sem transcrição)").slice(0, 300)}${audio}`;
        })
        .join("\n\n");
      return interaction.reply({ content: `🎙️ Últimas ${ultimos.length}:\n\n${texto}`.slice(0, 1900), ephemeral: true });
    }
  },
};
