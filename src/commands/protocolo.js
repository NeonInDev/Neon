// =============================================================
// /protocolo — THANOS, TONY e EMILIA
// -------------------------------------------------------------
// Gate por ID (perm.isDonoModeracao): o dono usa sem cargo de staff.
// Quem age no Discord é a Neon, com o cargo dela.
//
//   thanos          apaga todas as mensagens de um membro
//   tony            backup das mensagens do servidor em JSON
//   emilia          guarda e retira todos os cargos (tempo ou permanente)
//   emilia_restaurar devolve os cargos guardados
//   emilia_listar   quem está com cargos guardados
// =============================================================
const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType, ChannelType } = require("discord.js");
const { isDonoModeracao } = require("../perm");
const { log } = require("../logger");
const protocolos = require("../protocolos");

const MAX_APAGAR = protocolos.MAX_APAGAR_THANOS;

function kb(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// o token da interação morre em 15 min: se a edição falhar, manda DM
async function avisar(interaction, texto) {
  try {
    if (interaction.deferred || interaction.replied) return await interaction.editReply(texto);
    return await interaction.reply({ content: texto, ephemeral: true });
  } catch {
    try {
      const u = await interaction.client.users.fetch(interaction.user.id);
      await u.send(`📬 **Resultado do /protocolo**\n${texto}`);
    } catch {}
  }
}

module.exports = {
  publico: true, // o gate real é o isDonoModeracao() abaixo
  donoOnly: true,

  data: new SlashCommandBuilder()
    .setName("protocolo")
    .setDescription("Protocolos do dono: Thanos (apagar mensagens), Tony (backup), Emilia (cargos)")
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .addSubcommand((sc) =>
      sc
        .setName("thanos")
        .setDescription("Apaga TODAS as mensagens de um membro no servidor")
        .addUserOption((o) => o.setName("usuario").setDescription("De quem apagar as mensagens").setRequired(true))
        .addBooleanOption((o) =>
          o.setName("confirmar").setDescription("Tem certeza? Marque true pra executar de verdade").setRequired(true)
        )
        .addIntegerOption((o) =>
          o
            .setName("dias")
            .setDescription("Só mensagens dos últimos X dias (0 = tudo, padrão 30)")
            .setMinValue(0)
            .setMaxValue(3650)
        )
        .addChannelOption((o) =>
          o
            .setName("canal")
            .setDescription("Apagar só neste canal (padrão: todos)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("tony")
        .setDescription("Faz backup das mensagens do servidor em JSON")
        .addIntegerOption((o) =>
          o
            .setName("limite")
            .setDescription("Mensagens por canal (padrão 1000, máx 20000)")
            .setMinValue(50)
            .setMaxValue(20000)
        )
        .addChannelOption((o) =>
          o
            .setName("canal")
            .setDescription("Fazer backup só deste canal (padrão: todos)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)
        )
        .addChannelOption((o) =>
          o
            .setName("categoria")
            .setDescription("Fazer backup de uma categoria inteira")
            .addChannelTypes(ChannelType.GuildCategory)
        )
        .addBooleanOption((o) =>
          o
            .setName("topicos")
            .setDescription("Incluir tópicos de fórum e threads (padrão: sim quando é categoria)")
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("emilia")
        .setDescription("Tira e guarda todos os cargos de um membro (por um tempo ou permanente)")
        .addUserOption((o) => o.setName("usuario").setDescription("De quem tirar os cargos").setRequired(true))
        .addStringOption((o) =>
          o
            .setName("duracao")
            .setDescription("Ex.: 30m, 2h, 7d, 3s (semanas) — vazio = permanente")
            .setMaxLength(20)
        )
        .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setMaxLength(400))
    )
    .addSubcommand((sc) =>
      sc
        .setName("emilia_restaurar")
        .setDescription("Devolve os cargos guardados de um membro")
        .addUserOption((o) => o.setName("usuario").setDescription("De quem devolver").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("emilia_listar")
        .setDescription("Lista quem está com cargos guardados pelo protocolo Emilia")
    ),

  async execute(interaction) {
    if (!isDonoModeracao(interaction.user.id)) {
      log("WARN", "[PROTOCOLO] acesso negado", { user: interaction.user.id });
      return interaction.reply({ content: "❌ Esse comando é do dono do bot.", ephemeral: true });
    }
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "❌ Só funciona dentro do servidor.", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    // ---------- THANOS ----------
    if (sub === "thanos") {
      const alvo = interaction.options.getUser("usuario", true);
      const confirmar = interaction.options.getBoolean("confirmar", true);
      if (!confirmar) {
        return interaction.reply({
          content: "⏹️ Cancelado. Se era pra valer mesmo, rode de novo com `confirmar:true`.",
          ephemeral: true,
        });
      }
      const dias = interaction.options.getInteger("dias");
      const canal = interaction.options.getChannel("canal");
      const janela = dias == null ? 30 : dias;

      await interaction.deferReply({ ephemeral: true });
      await avisar(
        interaction,
        `🌌 **THANOS** iniciado para **${alvo.tag}**.\n` +
          `Janela: ${janela === 0 ? "tudo (pode demorar bastante)" : `${janela} dia(s)`} · ` +
          `Limite desta execução: ${MAX_APAGAR} mensagens.\n_Vou avisando o progresso._`
      );

      const r = await protocolos
        .thanos(guild, alvo.id, {
          canalId: canal?.id || null,
          dias: janela,
          onProgress: (p) =>
            avisar(
              interaction,
              `🌌 **THANOS** em andamento…\nCanais: **${p.feitos}/${p.canais}** · achadas: **${p.achadas}** · apagadas: **${p.apagadas}**`
            ),
        })
        .catch((err) => ({ ok: false, erro: err.message }));

      if (!r.ok) return avisar(interaction, `❌ Thanos: ${r.erro}`);

      return avisar(
        interaction,
        `🌌 **THANOS concluído** — **${alvo.tag}**\n` +
          `🧹 Apagadas: **${r.apagadas}** de **${r.achadas}** encontradas\n` +
          `📁 Canais varridos: **${r.canais}**` +
          (r.pulados ? ` (${r.pulados} sem permissão/limite)` : "") +
          (r.teto
            ? `\n⚠️ Bati no teto de ${MAX_APAGAR} mensagens. Rode de novo pra continuar de onde parou.`
            : "") +
          `\n\n_O Discord não deixa apagar em lote o que tem mais de 14 dias: essas saem uma por uma, por isso demora._`
      );
    }

    // ---------- TONY ----------
    if (sub === "tony") {
      const canal = interaction.options.getChannel("canal");
      const categoria = interaction.options.getChannel("categoria");
      const limite = interaction.options.getInteger("limite") || 1000;
      const topicosOpt = interaction.options.getBoolean("topicos");

      if (canal && categoria) {
        return interaction.reply({
          content: "❌ Escolhe um dos dois: `canal` ou `categoria`.",
          ephemeral: true,
        });
      }
      const incluirTopicos = topicosOpt == null ? !!categoria : topicosOpt;
      const onde = categoria ? ` da categoria **${categoria.name}**` : canal ? ` de ${canal}` : " do servidor";

      await interaction.deferReply({ ephemeral: true });
      await avisar(
        interaction,
        `🧡 **TONY** começou o backup${onde} (até ${limite} mensagens por canal` +
          `${incluirTopicos ? ", incluindo tópicos/threads" : ""})…`
      );

      const r = await protocolos
        .tony(guild, {
          canalId: canal?.id || null,
          categoriaIds: categoria ? [categoria.id] : null,
          incluirTopicos,
          limitePorCanal: limite,
          onProgress: (p) =>
            avisar(
              interaction,
              `🧡 **TONY** em andamento…\nCanais: **${p.feitos}/${p.canais}** · tópicos: **${p.topicos || 0}** · mensagens salvas: **${p.total}**`
            ),
        })
        .catch((err) => ({ ok: false, erro: err.message }));

      if (!r.ok) return avisar(interaction, `❌ Tony: ${r.erro}`);

      return avisar(
        interaction,
        `🧡 **TONY concluído**\n📦 **${r.total}** mensagem(ns) de **${r.canais}** canal(is)` +
          (r.totalTopicos ? ` + **${r.totalTopicos}** tópico(s) (${r.totalMensagensTopicos} msgs)` : "") +
          `\n💾 Arquivo: \`${r.arquivo}\` (${kb(r.bytes)})` +
          (r.vazios ? `\nℹ️ ${r.vazios} canal(is) sem mensagem acessível.` : "")
      );
    }

    // ---------- EMILIA (tirar) ----------
    if (sub === "emilia") {
      const alvo = interaction.options.getUser("usuario", true);
      const textoDuracao = interaction.options.getString("duracao");
      const motivo = interaction.options.getString("motivo") || "Sem motivo informado";

      const minutos = protocolos.duracaoDe(textoDuracao);
      if (minutos === undefined) {
        return interaction.reply({
          content: "❌ Duração inválida. Use `30m`, `2h`, `7d`, `3s` (semanas) ou deixe vazio pra permanente.",
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });
      const r = await protocolos
        .emilia(guild, alvo.id, { duracao: minutos, motivo, autor: interaction.user })
        .catch((err) => ({ ok: false, erro: err.message }));

      if (!r.ok) return avisar(interaction, `❌ Emilia: ${r.erro}`);

      const lista = r.cargos.map((c) => `• ${c.nome}${c.perigoso ? " ⚠️" : ""}`).join("\n");
      return avisar(
        interaction,
        `💜 **EMILIA** — cargos de **${alvo.tag}** guardados e retirados.\n` +
          `⏳ Devolução: **${r.duracaoTxt}**\n📄 ${motivo}\n\n` +
          `**${r.cargos.length} cargo(s):**\n${lista}` +
          (r.jaExistia ? "\n\nℹ️ Já havia cargos guardados dessa pessoa: juntei com os que estavam lá." : "")
      );
    }

    // ---------- EMILIA (devolver) ----------
    if (sub === "emilia_restaurar") {
      const alvo = interaction.options.getUser("usuario", true);
      await interaction.deferReply({ ephemeral: true });
      const r = await protocolos
        .restaurar(guild, alvo.id, { motivo: `pedido de ${interaction.user.tag}` })
        .catch((err) => ({ ok: false, erro: err.message }));

      if (!r.ok && !r.devolvidos?.length) return avisar(interaction, `❌ Emilia: ${r.erro}`);

      const devolvidos = (r.devolvidos || []).map((n) => `• ${n}`).join("\n") || "nenhum";
      const falharam = (r.falharam || []).map((f) => `• ${f.nome} — ${f.motivo}`).join("\n");
      return avisar(
        interaction,
        `💜 **EMILIA** — cargos de **${alvo.tag}** devolvidos: **${(r.devolvidos || []).length}**\n${devolvidos}` +
          (falharam ? `\n\n⚠️ Não deu pra devolver:\n${falharam}` : "")
      );
    }

    // ---------- EMILIA (listar) ----------
    if (sub === "emilia_listar") {
      const lista = protocolos.listarEmilia(guild.id);
      if (!lista.length) {
        return interaction.reply({ content: "💜 Ninguém está com cargos guardados neste servidor.", ephemeral: true });
      }
      const agora = Date.now();
      const linhas = lista
        .slice(0, 25)
        .map((r) => {
          const quando = r.expiraEm
            ? r.expiraEm <= agora
              ? "⏰ vencido (vou devolver no próximo ciclo)"
              : `⏳ devolve <t:${Math.floor(r.expiraEm / 1000)}:R>`
            : "♾️ permanente";
          return `• **${r.tag || r.userId}** (\`${r.userId}\`) — ${r.cargos.length} cargo(s) · ${quando}`;
        })
        .join("\n");
      return interaction.reply({
        content: `💜 **Protocolo Emilia** — ${lista.length} pessoa(s):\n${linhas}`,
        ephemeral: true,
      });
    }

    return interaction.reply({ content: "❌ Subcomando desconhecido.", ephemeral: true });
  },
};
