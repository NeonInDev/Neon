const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ApplicationIntegrationType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  AttachmentBuilder,
  EmbedBuilder,
} = require("discord.js");
const { isOwner } = require("../perm");
const quirksEnvio = require("../quirks_envio");

function normalizar(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// dono OU cargo Administrador ou superior (comandos que alteram coisas)
function podeUsar(interaction) {
  return (
    isOwner(interaction.user.id) ||
    (interaction.inGuild() && interaction.member.permissions.has(PermissionFlagsBits.Administrator))
  );
}

async function responderNome(interaction, lista) {
  const digitado = normalizar(interaction.options.getFocused());
  const opcoes = lista
    .filter((t) => !digitado || normalizar(t).includes(digitado))
    .slice(0, 25)
    .map((t) => ({ name: t, value: t }));
  await interaction.respond(opcoes);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("quirk")
    .setDescription("Gerenciar e consultar quirks")
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .addSubcommand((sc) =>
      sc
        .setName("enviar")
        .setDescription("Enviar uma quirk com card no canal escolhido (só admin+)")
        .addStringOption((o) =>
          o.setName("nome").setDescription("Nome da quirk").setRequired(true).setAutocomplete(true)
        )
        .addStringOption((o) =>
          o
            .setName("origem")
            .setDescription("Aba de origem da quirk")
            .addChoices(
              { name: "📦 pacote pronto", value: "pacote" },
              { name: "🌐 fandom (canônica)", value: "fandom" }
            )
        )
        .addStringOption((o) =>
          o
            .setName("canal")
            .setDescription("Onde enviar")
            .addChoices(
              { name: "quirks-livres", value: "livres" },
              { name: "quirk-sorteio", value: "sorteio" }
            )
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("informacao")
        .setDescription("Resumo de uma quirk canônica do banco da fandom (aberto)")
        .addStringOption((o) =>
          o.setName("nome").setDescription("Nome da quirk").setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("editar")
        .setDescription("Editar o texto de uma quirk já enviada (só admin+)")
        .addStringOption((o) =>
          o.setName("nome").setDescription("Nome da quirk").setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("apagar")
        .setDescription("Apagar a mensagem de uma quirk enviada (atualiza o sumário; só admin+)")
        .addStringOption((o) =>
          o.setName("nome").setDescription("Nome da quirk").setRequired(true).setAutocomplete(true)
        )
        .addBooleanOption((o) =>
          o.setName("do_banco").setDescription("Também tirar do banco (vai pro arquivo de apagadas)")
        )
    )
    .addSubcommand((sc) =>
      sc.setName("sumario").setDescription("Reconstruir agora o sumário com os links das quirks (só admin+)")
    ),

  async autocomplete(interaction) {
    if (!podeUsar(interaction)) return await interaction.respond([]);
    const sub = interaction.options.getSubcommand(false);
    if (sub === "informacao") return await responderNome(interaction, quirksEnvio.listarFandom());
    if (interaction.options.getString("origem") === "fandom")
      return await responderNome(interaction, quirksEnvio.listarFandom());
    return await responderNome(interaction, quirksEnvio.listar());
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // consulta aberta pra todo mundo
    if (sub === "informacao") {
      await interaction.deferReply();
      const nome = interaction.options.getString("nome");
      const r = await quirksEnvio.informacao(nome);
      if (!r) {
        const dica = quirksEnvio.sugerirNomes(nome, quirksEnvio.listarFandom());
        const extra = dica.length ? `\n👉 Você quis dizer: **${dica.join("**, **")}**?` : "";
        return await interaction.editReply(`❌ Não achei essa quirk no banco da fandom.${extra}`);
      }
      const envio = { content: r.texto };
      if (r.painel) {
        envio.files = [new AttachmentBuilder(r.painel)];
      } else if (r.fandom.imagem) {
        envio.embeds = [new EmbedBuilder().setImage(r.fandom.imagem)];
      }
      return await interaction.editReply(envio);
    }

    if (!podeUsar(interaction)) {
      return await interaction.reply({ content: "🔒 Só admins ou superior.", ephemeral: true });
    }

    if (sub === "sumario") {
      await interaction.deferReply({ ephemeral: true });
      try {
        const n = await quirksEnvio.reconstruirSumario(interaction.client);
        await interaction.editReply(`📚 Sumário reconstruído (${n} mensagens).`);
      } catch (err) {
        await interaction.editReply(`❌ Sumário: ${err.message}`);
      }
      return;
    }

    const titulo = interaction.options.getString("nome");

    if (sub === "enviar") {
      const tipo = interaction.options.getString("canal") || "livres";
      const origem = interaction.options.getString("origem") || "pacote";
      await interaction.deferReply({ ephemeral: true });
      try {
        let msg;
        let rotulo;
        if (origem === "fandom") {
          const f = quirksEnvio.buscarFandom(titulo);
          if (!f) throw new Error(`"${titulo}" não existe no banco da fandom`);
          msg = await quirksEnvio.enviarQuirk(interaction.client, f, tipo, "fandom");
          rotulo = f.nome;
        } else {
          const q = quirksEnvio.buscar(titulo);
          if (!q) throw new Error(`"${titulo}" não está no pacote pronto`);
          msg = await quirksEnvio.enviarQuirk(interaction.client, q, tipo, "pacote");
          rotulo = q.titulo;
        }
        let extra = "";
        if (tipo !== "sorteio") {
          try {
            const n = await quirksEnvio.reconstruirSumario(interaction.client);
            extra = ` Sumário atualizado (${n} msgs)!`;
          } catch {}
        }
        await interaction.editReply(`✅ Enviei **${rotulo}** (aba: ${origem}) em ${msg.channel}.${extra}`);
      } catch (err) {
        await interaction.editReply(`❌ Quirks: ${err.message}`);
      }
      return;
    }

    if (sub === "editar") {
      const q = quirksEnvio.buscar(titulo);
      if (!q) {
        return await interaction.reply({ content: `❌ Não achei a quirk "${titulo}" nos bancos.`, ephemeral: true });
      }
      const modal = new ModalBuilder().setCustomId(`quirk:${q.titulo}`).setTitle(`Editar ${q.titulo}`.slice(0, 45));
      const input = new TextInputBuilder()
        .setCustomId("texto")
        .setLabel("Texto do card")
        .setStyle(TextInputStyle.Paragraph)
        .setValue((q.textoNovo || q.texto || "").slice(0, 4000))
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return await interaction.showModal(modal);
    }

    if (sub === "apagar") {
      await interaction.deferReply({ ephemeral: true });
      try {
        const q = quirksEnvio.buscar(titulo);
        if (!q) throw new Error(`"${titulo}" não está nos bancos`);
        const canal = await quirksEnvio.acharCanal(interaction.client, q.canal || "livres");
        if (!canal) throw new Error(`canal de quirks (${q.canal || "livres"}) não encontrado`);
        const msg = await quirksEnvio.acharMensagem(canal, q.titulo);
        let apagada = false;
        if (msg) {
          await msg.delete();
          apagada = true;
        }
        const removida = interaction.options.getBoolean("do_banco") ? quirksEnvio.remover(q.titulo) : 0;
        let extra = "";
        try {
          const n = await quirksEnvio.reconstruirSumario(interaction.client);
          extra = ` Sumário atualizado (${n} msgs).`;
        } catch {}
        const partes = [];
        partes.push(apagada ? "🗑️ Mensagem apagada." : "⚠️ Mensagem não encontrada no canal.");
        if (removida) partes.push("🗄️ Removida do banco e registrada em apagadas.");
        partes.push(extra);
        await interaction.editReply(partes.join(" "));
      } catch (err) {
        await interaction.editReply(`❌ Quirks: ${err.message}`);
      }
      return;
    }
  },

  async modalSubmit(interaction) {
    if (!podeUsar(interaction)) {
      return await interaction.reply({ content: "🔒 Só admins ou superior.", ephemeral: true });
    }
    const titulo = interaction.customId.split(":").slice(1).join(":");
    const novoTexto = interaction.fields.getTextInputValue("texto");
    const ok = quirksEnvio.atualizarTexto(titulo, novoTexto);
    if (!ok) {
      return await interaction.reply({ content: `❌ Não achei "${titulo}" nos bancos.`, ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const q = quirksEnvio.buscar(titulo);
      const canal = await quirksEnvio.acharCanal(interaction.client, (q && q.canal) || "livres");
      if (!canal) throw new Error("canal não encontrado");
      const msg = await quirksEnvio.acharMensagem(canal, titulo);
      if (msg) {
        await msg.edit({ content: novoTexto });
        await interaction.editReply(`✅ Editei **${titulo}** no canal e no banco.`);
      } else {
        await interaction.editReply(`📦 Salvei o texto novo de **${titulo}** no banco (mensagem não estava no canal).`);
      }
    } catch (err) {
      await interaction.editReply(`❌ Salvei no banco, mas falhou editar no canal: ${err.message}`);
    }
  },
};
