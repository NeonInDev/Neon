const { SlashCommandBuilder } = require("discord.js");
const { isOwner, guestRecords, adicionarGuest, removerGuest } = require("../perm");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("convidado")
    .setDescription("Gerenciar pessoas que só podem conversar com a Neon")
    .addStringOption((o) => o
      .setName("acao")
      .setDescription("Operação")
      .setRequired(true)
      .addChoices(
        { name: "Adicionar", value: "adicionar" },
        { name: "Remover", value: "remover" },
        { name: "Listar", value: "listar" },
      ))
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário convidado"))
    .addStringOption((o) => o.setName("duracao").setDescription("Ex.: 30 minutos, 2 horas ou 1 dia")),
  async execute(interaction) {
    if (!isOwner(interaction.user.id)) {
      await interaction.reply({ content: "❌ Apenas o chefe pode gerenciar convidados.", ephemeral: true });
      return;
    }
    const acao = interaction.options.getString("acao");
    const usuario = interaction.options.getUser("usuario");
    const duracaoTexto = interaction.options.getString("duracao");
    const lista = guestRecords();
    if (acao === "listar") {
      await interaction.reply({
        content: lista.length
          ? `👥 **Convidados (${lista.length})**\n${lista.map((item) => {
            const adicionado = item.addedAt
              ? `<t:${Math.floor(item.addedAt / 1000)}:F>`
              : "data não registrada";
            const expira = item.expiresAt
              ? `<t:${Math.floor(item.expiresAt / 1000)}:F> (<t:${Math.floor(item.expiresAt / 1000)}:R>)`
              : "nunca";
            return `• <@${item.id}> — adicionado: ${adicionado} — expira: ${expira}`;
          }).join("\n")}`
          : "👥 Nenhum convidado cadastrado.",
        ephemeral: true,
      });
      return;
    }
    if (!usuario) {
      await interaction.reply({ content: "❌ Informe o usuário na opção `usuario`.", ephemeral: true });
      return;
    }
    if (usuario.bot) {
      await interaction.reply({ content: "❌ Bots não podem ser convidados.", ephemeral: true });
      return;
    }
    if (acao === "adicionar") {
      const m = duracaoTexto?.match(/^(\d+(?:[.,]\d+)?)\s*(minutos?|mins?|horas?|dias?|d)$/i);
      let duracaoMs = null;
      if (m) {
        const valor = Number(m[1].replace(",", "."));
        const multiplicador = /^min/i.test(m[2]) ? 60000 : /^hor/i.test(m[2]) ? 3600000 : 86400000;
        duracaoMs = Math.round(valor * multiplicador);
      }
      adicionarGuest(usuario.id, duracaoMs);
    }
    else removerGuest(usuario.id);
    await interaction.reply({
      content: acao === "adicionar"
        ? `✅ ${usuario} agora pode conversar com a Neon, sem comandos nem acesso ao PC.`
        : `✅ ${usuario} removido da lista de convidados.`,
      ephemeral: true,
    });
  },
};
