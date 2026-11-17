// =============================================================
// /moderacao — moderação do dono, feita PELA NEON
// -------------------------------------------------------------
// O gate é ID (perm.isDonoModeracao), nunca cargo do Discord: o dono
// usa mesmo sem ser staff, porque quem age é a Neon, com o cargo dela.
//
// Hierarquia continua valendo: a Neon só mexe em quem está abaixo do
// cargo dela, e nunca no dono do servidor.
// =============================================================
const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const { isDonoModeracao } = require("../perm");
const { log } = require("../logger");
const { motivoRecusa, motivoRecusaCargo, cargoPerigoso } = require("../mod-utils");

const MOTIVO_PADRAO = "Sem motivo informado";

async function alvoDe(interaction) {
  const user = interaction.options.getUser("usuario", true);
  const membro = await interaction.guild.members.fetch(user.id).catch(() => null);
  return { user, membro };
}

function motivoDe(interaction) {
  return interaction.options.getString("motivo") || MOTIVO_PADRAO;
}

module.exports = {
  // o gate real é o isDonoModeracao() abaixo; isso aqui só pula a
  // whitelist genérica do interactionCreate (que inclui convidados).
  publico: true,
  // o publicador usa isso pra esconder o comando de quem não é dono
  donoOnly: true,

  data: new SlashCommandBuilder()
    .setName("moderacao")
    .setDescription("Moderação do dono — age com o cargo da Neon, sem precisar de staff")
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    // Não dá pra esconder por ID via API: o Discord recusa bot token no
    // endpoint de permissões de comando (403 "Bots cannot use this
    // endpoint"). Então o comando aparece na lista, mas quem não é dono
    // só recebe "esse comando é do dono". Para esconder mesmo, o dono
    // pode ir em Configurações do Servidor > Integrações > Neon e
    // liberar /moderacao só para os IDs dele.
    .addSubcommand((sc) =>
      sc
        .setName("silenciar")
        .setDescription("Silencia (timeout) um membro")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem silenciar").setRequired(true))
        .addIntegerOption((o) =>
          o
            .setName("minutos")
            .setDescription("Duração em minutos (máx. 40320 = 28 dias)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(40320)
        )
        .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setMaxLength(400))
    )
    .addSubcommand((sc) =>
      sc
        .setName("desmutar")
        .setDescription("Retira o timeout de um membro")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem liberar").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("expulsar")
        .setDescription("Expulsa (kick) um membro")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem expulsar").setRequired(true))
        .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setMaxLength(400))
    )
    .addSubcommand((sc) =>
      sc
        .setName("banir")
        .setDescription("Bane um membro")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem banir").setRequired(true))
        .addIntegerOption((o) =>
          o
            .setName("apagar_dias")
            .setDescription("Apagar mensagens dos últimos X dias (0-7)")
            .setMinValue(0)
            .setMaxValue(7)
        )
        .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setMaxLength(400))
    )
    .addSubcommand((sc) =>
      sc
        .setName("adicionar_cargo")
        .setDescription("Dá um cargo a um membro")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem recebe").setRequired(true))
        .addRoleOption((o) => o.setName("cargo").setDescription("Cargo a dar").setRequired(true))
        .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setMaxLength(400))
    )
    .addSubcommand((sc) =>
      sc
        .setName("remover_cargo")
        .setDescription("Tira um cargo de um membro")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem perde").setRequired(true))
        .addRoleOption((o) => o.setName("cargo").setDescription("Cargo a tirar").setRequired(true))
        .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setMaxLength(400))
    ),

  async execute(interaction) {
    if (!isDonoModeracao(interaction.user.id)) {
      log("WARN", "[MODERACAO] acesso negado", { user: interaction.user.id });
      return interaction.reply({ content: "❌ Esse comando é do dono do bot.", ephemeral: true });
    }
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "❌ Só funciona dentro do servidor.", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    const { user, membro } = await alvoDe(interaction);
    if (!membro) {
      return interaction.editReply(`❌ **${user.tag}** não está no servidor (ou não achei o membro).`);
    }

    const recusa = motivoRecusa(interaction.guild, interaction.user.id, membro, sub);
    if (recusa) return interaction.editReply(`❌ ${recusa}`);

    const motivo = motivoDe(interaction);
    const por = `dono: ${interaction.user.tag}`;

    try {
      if (sub === "silenciar") {
        const minutos = interaction.options.getInteger("minutos", true);
        await membro.timeout(minutos * 60000, `${motivo} (${por})`);
        log("WARN", "[MODERACAO] silenciou", { por: interaction.user.id, alvo: membro.id, minutos });
        return interaction.editReply(`🔇 **${user.tag}** silenciado por **${minutos} min**.\n📄 ${motivo}`);
      }

      if (sub === "desmutar") {
        await membro.timeout(null, `${motivo} (${por})`);
        log("INFO", "[MODERACAO] removeu timeout", { por: interaction.user.id, alvo: membro.id });
        return interaction.editReply(`🔊 Timeout de **${user.tag}** removido.`);
      }

      if (sub === "expulsar") {
        await membro.kick(`${motivo} (${por})`);
        log("WARN", "[MODERACAO] expulsou", { por: interaction.user.id, alvo: membro.id });
        return interaction.editReply(`👢 **${user.tag}** expulso.\n📄 ${motivo}`);
      }

      if (sub === "banir") {
        const dias = interaction.options.getInteger("apagar_dias") || 0;
        await interaction.guild.members.ban(membro.id, {
          deleteMessageSeconds: dias * 86400,
          reason: `${motivo} (${por})`,
        });
        log("WARN", "[MODERACAO] baniu", { por: interaction.user.id, alvo: membro.id, dias });
        return interaction.editReply(
          `🔨 **${user.tag}** banido.${dias ? ` Mensagens de ${dias}d apagadas.` : ""}\n📄 ${motivo}`
        );
      }

      if (sub === "adicionar_cargo" || sub === "remover_cargo") {
        const cargo = interaction.options.getRole("cargo", true);
        const erroCargo = motivoRecusaCargo(interaction.guild, membro, cargo);
        if (erroCargo) return interaction.editReply(`❌ ${erroCargo}`);

        const tem = membro.roles.cache.has(cargo.id);
        const dando = sub === "adicionar_cargo";

        if (dando && tem) return interaction.editReply(`ℹ️ **${user.tag}** já tem **${cargo.name}**.`);
        if (!dando && !tem) return interaction.editReply(`ℹ️ **${user.tag}** não tem **${cargo.name}**.`);

        if (dando) await membro.roles.add(cargo, `${motivo} (${por})`);
        else await membro.roles.remove(cargo, `${motivo} (${por})`);

        log("WARN", "[MODERACAO] cargo alterado", {
          por: interaction.user.id,
          alvo: membro.id,
          cargo: cargo.id,
          dando,
        });

        const aviso =
          dando && cargoPerigoso(cargo)
            ? "\n⚠️ Esse cargo tem permissão alta (Admin/Gerenciar). Confere se era isso mesmo."
            : "";
        return interaction.editReply(
          `${dando ? "➕" : "➖"} **${user.tag}** ${dando ? "recebeu" : "perdeu"} **${cargo.name}**.\n📄 ${motivo}${aviso}`
        );
      }

      return interaction.editReply("❌ Subcomando desconhecido.");
    } catch (err) {
      log("ERROR", "[MODERACAO] falhou", { sub, alvo: membro.id, erro: err.message });
      return interaction.editReply(`❌ ${sub}: ${err.message}`);
    }
  },
};
