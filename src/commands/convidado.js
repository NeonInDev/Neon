const { SlashCommandBuilder } = require("discord.js");
const { isOwner, guests, salvarGuests } = require("../perm");

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
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário convidado")),
  async execute(interaction) {
    if (!isOwner(interaction.user.id)) {
      await interaction.reply({ content: "❌ Apenas o chefe pode gerenciar convidados.", ephemeral: true });
      return;
    }
    const acao = interaction.options.getString("acao");
    const usuario = interaction.options.getUser("usuario");
    const lista = guests();
    if (acao === "listar") {
      await interaction.reply({
        content: lista.length ? `👥 Convidados: ${lista.map((id) => `<@${id}>`).join(", ")}` : "👥 Nenhum convidado cadastrado.",
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
    const nova = acao === "adicionar"
      ? [...new Set([...lista, usuario.id])]
      : lista.filter((id) => id !== usuario.id);
    salvarGuests(nova);
    await interaction.reply({
      content: acao === "adicionar"
        ? `✅ ${usuario} agora pode conversar com a Neon, sem comandos nem acesso ao PC.`
        : `✅ ${usuario} removido da lista de convidados.`,
      ephemeral: true,
    });
  },
};
