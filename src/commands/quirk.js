const {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const { isOwner } = require("../perm");
const quirksEnvio = require("../quirks_envio");

function normalizar(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

async function responderNome(canalAlvo, interaction) {
  const digitado = normalizar(interaction.options.getFocused());
  const opcoes = quirksEnvio
    .listar()
    .filter((t) => !digitado || normalizar(t).includes(digitado))
    .slice(0, 25)
    .map((t) => ({ name: t, value: t }));
  await interaction.respond(opcoes);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("quirk")
    .setDescription("Gerenciar quirks do pacote (só dono)")
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .addSubcommand((sc) =>
      sc
        .setName("enviar")
        .setDescription("Enviar uma quirk no canal quirks-livres")
        .addStringOption((o) =>
          o.setName("nome").setDescription("Nome da quirk").setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("editar")
        .setDescription("Editar o texto da mensagem de uma quirk já enviada")
        .addStringOption((o) =>
          o.setName("nome").setDescription("Nome da quirk").setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("apagar")
        .setDescription("Apagar a mensagem de uma quirk já enviada")
        .addStringOption((o) =>
          o.setName("nome").setDescription("Nome da quirk").setRequired(true).setAutocomplete(true)
        )
        .addBooleanOption((o) =>
          o
            .setName("do_pacote")
            .setDescription("Também remover a quirk do pacote (pra não reenviar depois)")
        )
    ),

  async autocomplete(interaction) {
    if (!isOwner(interaction.user.id)) return await interaction.respond([]);
    await responderNome(null, interaction);
  },

  async execute(interaction) {
    if (!isOwner(interaction.user.id)) {
      return await interaction.reply({ content: "🔒 Esse comando é só pro dono.", ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    const titulo = interaction.options.getString("nome");
    const q = quirksEnvio.buscar(titulo);
    if (!q) {
      return await interaction.reply({ content: `❌ Não achei a quirk "${titulo}" no pacote.`, ephemeral: true });
    }

    if (sub === "enviar") {
      await interaction.deferReply({ ephemeral: true });
      try {
        const canal = await quirksEnvio.enviarQuirk(interaction.client, q);
        await interaction.editReply(`✅ Enviei **${q.titulo}** em ${canal}.`);
      } catch (err) {
        await interaction.editReply(`❌ Quirks: ${err.message}`);
      }
      return;
    }

    if (sub === "editar") {
      const modal = new ModalBuilder().setCustomId(`quirk:${q.titulo}`).setTitle(`Editar ${q.titulo}`.slice(0, 45));
      const input = new TextInputBuilder()
        .setCustomId("texto")
        .setLabel("Texto do card")
        .setStyle(TextInputStyle.Paragraph)
        .setValue((q.textoNovo || q.texto).slice(0, 4000))
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return await interaction.showModal(modal);
    }

    if (sub === "apagar") {
      await interaction.deferReply({ ephemeral: true });
      try {
        const canal = await quirksEnvio.acharCanal(interaction.client);
        if (!canal) throw new Error("canal quirks-livres não encontrado");
        const msg = await quirksEnvio.acharMensagem(canal, q.titulo);
        let apagada = false;
        if (msg) {
          await msg.delete();
          apagada = true;
        }
        const removida = interaction.options.getBoolean("do_pacote")
          ? quirksEnvio.remover(q.titulo)
          : 0;
        const partes = [];
        partes.push(apagada ? "🗑️ Mensagem apagada no canal." : "⚠️ Mensagem não encontrada no canal.");
        if (removida) partes.push("📦 Também removi do pacote.");
        await interaction.editReply(partes.join(" "));
      } catch (err) {
        await interaction.editReply(`❌ Quirks: ${err.message}`);
      }
      return;
    }
  },

  async modalSubmit(interaction) {
    if (!isOwner(interaction.user.id)) {
      return await interaction.reply({ content: "🔒 Esse comando é só pro dono.", ephemeral: true });
    }
    const titulo = interaction.customId.split(":").slice(1).join(":");
    const novoTexto = interaction.fields.getTextInputValue("texto");
    const ok = quirksEnvio.atualizarTexto(titulo, novoTexto);
    if (!ok) {
      return await interaction.reply({ content: `❌ Não achei "${titulo}" no pacote.`, ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const canal = await quirksEnvio.acharCanal(interaction.client);
      if (!canal) throw new Error("canal quirks-livres não encontrado");
      const msg = await quirksEnvio.acharMensagem(canal, titulo);
      if (msg) {
        await msg.edit({ content: novoTexto });
        await interaction.editReply(`✅ Editei **${titulo}** no canal e no pacote.`);
      } else {
        await interaction.editReply(`📦 Salvei o texto novo de **${titulo}** no pacote (mensagem não estava no canal).`);
      }
    } catch (err) {
      await interaction.editReply(`❌ Salvei no pacote, mas falhou editar no canal: ${err.message}`);
    }
  },
};
