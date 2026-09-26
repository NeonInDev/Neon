const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ApplicationIntegrationType,
} = require("discord.js");

// cada subcomando exige sua propria permissao (nao todas de uma vez)
const PERM_SUB = {
  mute: PermissionFlagsBits.ModerateMembers,
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
};

function ehMod(interaction, sub) {
  return interaction.member.permissions.has(PERM_SUB[sub] || PermissionFlagsBits.ModerateMembers);
}

function checarAlvo(interaction, alvo, membro) {
  if (alvo.id === interaction.user.id) return "Você não pode fazer isso com você mesmo 😅";
  if (alvo.id === interaction.client.user.id) return "Eu prefiro não moderar a mim mesma 💜";
  // alvo pode nao estar mais no servidor (ban por ID) — nesses casos so checa hierarquia se der
  if (!membro) return null;
  if (
    interaction.member.roles.highest.comparePositionTo(membro.roles.highest) <= 0 &&
    interaction.guild.ownerId !== interaction.user.id
  ) {
    return "O cargo dele é igual ou maior que o seu.";
  }
  return null;
}

module.exports = {
  publico: true, // quem pode usar é definido pelo Discord (default_member_permissions), nao pela whitelist
  data: new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Ferramentas de moderação")
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers | PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers
    )
    .addSubcommand((sc) =>
      sc
        .setName("mute")
        .setDescription("Silencia um usuário por um tempo")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem silenciar").setRequired(true))
        .addIntegerOption((o) =>
          o
            .setName("minutos")
            .setDescription("Duração em minutos")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(40320)
        )
        .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setMaxLength(400))
    )
    .addSubcommand((sc) =>
      sc
        .setName("kick")
        .setDescription("Expulsa um usuário")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem expulsar").setRequired(true))
        .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setMaxLength(400))
    )
    .addSubcommand((sc) =>
      sc
        .setName("ban")
        .setDescription("Bane um usuário")
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
        .setName("apagar")
        .setDescription("Apaga as últimas mensagens deste canal")
        .addIntegerOption((o) =>
          o.setName("quantidade").setDescription("Quantas mensagens (2-100)").setRequired(true).setMinValue(2).setMaxValue(100)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("warn")
        .setDescription("Aplica um warn (com punição automática conforme a escala)")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem avisar").setRequired(true))
        .addStringOption((o) => o.setName("motivo").setDescription("Motivo do warn").setMaxLength(400))
    )
    .addSubcommand((sc) =>
      sc
        .setName("histórico")
        .setDescription("Mostra os warns de um usuário")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem consultar").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("limparwarns")
        .setDescription("Zera os warns de um usuário")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem limpar").setRequired(true))
        .addBooleanOption((o) => o.setName("apagar_historico").setDescription("Apagar também o histórico (padrão: não)"))
    )
    .addSubcommand((sc) =>
      sc
        .setName("pendentes")
        .setDescription("Lista kick/ban que esperam confirmação de um Admin")
        .addUserOption((o) => o.setName("usuario").setDescription("Decide o pedido desta pessoa"))
        .addBooleanOption((o) =>
          o
            .setName("aprovar")
            .setDescription("true = confirma a punição, false = recusa e libera o mute")
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("antiraid")
        .setDescription("Liga/desliga o antiraid ou ajusta o limite")
        .addStringOption((o) =>
          o
            .setName("acao")
            .setDescription("O que fazer")
            .setRequired(true)
            .addChoices(
              { name: "Ativar", value: "on" },
              { name: "Desativar", value: "off" },
              { name: "Configurar", value: "config" }
            )
        )
        .addIntegerOption((o) => o.setName("max_joins").setDescription("Máx. entradas na janela (padrão 5)").setMinValue(2).setMaxValue(50))
        .addIntegerOption((o) => o.setName("janela").setDescription("Janela em segundos (padrão 20)").setMinValue(5).setMaxValue(300))
        .addStringOption((o) =>
          o
            .setName("punir_com")
            .setDescription("Ação para contas novas no raid")
            .addChoices({ name: "Kick", value: "kick" }, { name: "Timeout 1h", value: "timeout" }, { name: "Ban", value: "ban" })
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("automod")
        .setDescription("Liga/desliga filtros ou ajusta limites")
        .addStringOption((o) =>
          o
            .setName("filtro")
            .setDescription("Filtro")
            .setRequired(true)
            .addChoices(
              { name: "Tudo (ligar/desligar)", value: "tudo" },
              { name: "Convites de Discord", value: "convites" },
              { name: "Menção em massa", value: "mencao" },
              { name: "Zalgo", value: "zalgo" },
              { name: "Links", value: "links" },
              { name: "Flood", value: "flood" },
              { name: "Palavra proibida", value: "palavra" },
              { name: "Exceção (liberar frase)", value: "excecao" },
              { name: "Canal sem flood", value: "semflood" },
              { name: "Canal sem bloqueio de convite", value: "semconvite" }
            )
        )
        .addBooleanOption((o) => o.setName("ligar").setDescription("Ligar (sim) ou desligar (não)"))
        .addStringOption((o) => o.setName("valor").setDescription("Palavra proibida, quando filtro = palavra"))
        .addChannelOption((o) => o.setName("canal_flood").setDescription("Canal a isentar (semflood / semconvite)"))
        .addIntegerOption((o) => o.setName("limite").setDescription("Limite numérico do filtro").setMinValue(2).setMaxValue(50))
    )
    .addSubcommand((sc) =>
      sc
        .setName("canal_log")
        .setDescription("Define onde os logs de moderação vão")
        .addChannelOption((o) => o.setName("canal").setDescription("Canal de logs").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("escalar")
        .setDescription("Define a punição para um número de warns")
        .addIntegerOption((o) => o.setName("warns").setDescription("A partir de quantos warns").setRequired(true).setMinValue(1).setMaxValue(20))
        .addStringOption((o) =>
          o
            .setName("acao")
            .setDescription("Ação")
            .setRequired(true)
            .addChoices(
              { name: "Timeout (silenciar)", value: "timeout" },
              { name: "Kick (expulsar)", value: "kick" },
              { name: "Ban", value: "ban" },
              { name: "Nenhuma", value: "nenhuma" }
            )
        )
        .addIntegerOption((o) => o.setName("minutos").setDescription("Minutos (se for timeout)").setMinValue(1).setMaxValue(40320))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const automod = require("../automod");

    // ---- subcomandos do automod ----
    if (["warn", "histórico", "limparwarns", "antiraid", "automod", "canal_log", "escalar"].includes(sub)) {
      const precisa = PermissionFlagsBits.ModerateMembers;
      if (!interaction.memberPermissions?.has(precisa)) {
        return await interaction.reply({ content: "🔒 Você precisa de Gerenciar Mensagens / Silenciar Membros.", ephemeral: true });
      }
      if (!interaction.guild.members.me?.permissions?.has(precisa)) {
        return await interaction.reply({ content: "❌ Não tenho permissão de moderação aqui.", ephemeral: true });
      }
      const cfg = automod.configGuild(interaction.guild.id);
      const guild = interaction.guild;

      if (sub === "warn") {
        const alvo = interaction.options.getUser("usuario", true);
        const motivo = interaction.options.getString("motivo") || "Sem motivo informado";
        const erro = checarAlvo(interaction, alvo, await guild.members.fetch(alvo.id).catch(() => null));
        if (erro) return await interaction.reply({ content: `❌ ${erro}`, ephemeral: true });
        await interaction.deferReply();
        const r = await automod.darWarn(guild, alvo, motivo, interaction.user);
        const extra = r.punicao ? `\n🔨 ${automod.punicaoTexto(r.punicao, r.warn)}` : "\n🔨 Sem punição automática neste nível.";
        return await interaction.editReply(`⚠️ **${alvo.tag}** — ${r.warn}º warn (total ${r.total}).${extra}`);
      }

      if (sub === "histórico") {
        const alvo = interaction.options.getUser("usuario", true);
        const reg = automod.contarWarns(guild.id, alvo.id);
        if (!reg.total) return await interaction.reply({ content: `✅ **${alvo.tag}** não tem warns.`, ephemeral: true });
        const linhas = automod
          .historico(guild.id, alvo.id, 10)
          .map((h, i) => `${i + 1}. <t:${Math.floor(h.em / 1000)}:R> — ${h.motivo}${h.automatico ? " _(auto)_" : h.autorTag ? ` _(${h.autorTag})_` : ""}`)
          .join("\n");
        return await interaction.reply({
          content: `📋 **${alvo.tag}** — ${reg.ativo} ativo(s), ${reg.total} no total.\n${linhas}`,
          ephemeral: true,
        });
      }

      if (sub === "limparwarns") {
        const alvo = interaction.options.getUser("usuario", true);
        const apagar = interaction.options.getBoolean("apagar_historico") || false;
        automod.limparWarns(guild.id, alvo.id, apagar);
        automod.persistir();
        return await interaction.reply({
          content: `🧹 Warns de **${alvo.tag}** limpos${apagar ? " (histórico apagado)" : " (contagem zerada)"}.`,
          ephemeral: true,
        });
      }

      if (sub === "pendentes") {
        const alvo = interaction.options.getUser("usuario");
        if (alvo) {
          if (interaction.options.getBoolean("aprovar") === null) {
            const p = automod.pendente(guild.id, alvo.id);
            if (!p) return await interaction.reply({ content: `📭 Não há pedido pendente de ${alvo.tag}.`, ephemeral: true });
            return await interaction.reply({
              content:
                `⏸️ Pedido de **${p.acao === "ban" ? "BAN" : "KICK"}** para ${p.userTag}\n` +
                `📄 ${p.motivo}\n` +
                `Use: \`/mod pendentes usuario:${alvo.id} aprovar:true\` ou \`aprovar:false\`.`,
              ephemeral: true,
            });
          }
          if (!automod.ehAdmin(guild, interaction.user)) {
            return await interaction.reply({
              content: "⛔ Só o **dono do servidor** ou alguém com **Administrador** decide punição.",
              ephemeral: true,
            });
          }
          const r = await automod.decidirPuncao(guild, alvo.id, interaction.options.getBoolean("aprovar"), interaction.user);
          return await interaction.reply({ content: r.ok ? r.texto : `❌ ${r.erro}`, ephemeral: true });
        }

        const lista = automod.listarPendentes(guild.id);
        if (!lista.length) {
          return await interaction.reply({ content: "✅ Nenhum kick/ban aguardando confirmação.", ephemeral: true });
        }
        const linhas = lista
          .slice(0, 20)
          .map((p) => `⏸️ **${p.userTag}** (\`${p.userId}\`) — ${p.acao.toUpperCase()}\n   📄 ${String(p.motivo).slice(0, 120)}`)
          .join("\n");
        return await interaction.reply({
          content:
            `⏸️ **${lista.length}** punição(ões) aguardando um Admin:\n${linhas}\n\n` +
            `Confirme pelo botão 🔨 no aviso do log, ou use \`/mod pendentes usuario:<id> aprovar:true\`.`,
          ephemeral: true,
        });
      }

      if (sub === "antiraid") {
        const acao = interaction.options.getString("acao");
        if (acao === "on") cfg.antiraid.ativo = true;
        if (acao === "off") cfg.antiraid.ativo = false;
        const maxJoins = interaction.options.getInteger("max_joins");
        if (maxJoins) cfg.antiraid.maxJoins = maxJoins;
        const janela = interaction.options.getInteger("janela");
        if (janela) cfg.antiraid.janelaSegundos = janela;
        const punir = interaction.options.getString("punir_com");
        if (punir) cfg.antiraid.acao = punir;
        automod.persistir();
        return await interaction.reply({
          content: `🛡️ Antiraid **${cfg.antiraid.ativo ? "ATIVO" : "desativado"}** — ${cfg.antiraid.maxJoins} entradas em ${cfg.antiraid.janelaSegundos}s, punição: \`${cfg.antiraid.acao}\`.`,
          ephemeral: true,
        });
      }

      if (sub === "automod") {
        const filtro = interaction.options.getString("filtro");
        const ligar = interaction.options.getBoolean("ligar");
        const valor = interaction.options.getString("valor");
        const limite = interaction.options.getInteger("limite");
        const f = cfg.filtros;
        if (filtro === "tudo") {
          cfg.enabled = ligar === false ? false : true;
          f.ativo = cfg.enabled;
        } else if (filtro === "palavra") {
          if (valor) {
            const idx = f.palavras.findIndex((p) => automod.normalizar(p) === automod.normalizar(valor));
            if (ligar === false) {
              if (idx >= 0) f.palavras.splice(idx, 1);
            } else if (idx < 0) f.palavras.push(valor);
          } else if (ligar === false) {
            f.palavras = [];
        } else if (filtro === "excecao") {
          if (!Array.isArray(f.excecoes)) f.excecoes = [];
          if (valor) {
            const idx = f.excecoes.findIndex((e) => automod.normalizar(e) === automod.normalizar(valor));
            if (ligar === false) {
              if (idx >= 0) f.excecoes.splice(idx, 1);
            } else if (idx < 0) f.excecoes.push(valor);
          } else if (ligar === false) {
            f.excecoes = [];
          }
          automod.persistir();
          return await interaction.reply({
            content: f.excecoes.length
              ? `✅ **${f.excecoes.length}** exceção(ões) liberada(s): ${f.excecoes.map((e) => `\`${e}\``).join(", ")}`
              : "✅ Exceções limpas.",
            ephemeral: true,
          });
        } else {
            // sem valor = semeia a lista padrao (ofensas/xingamentos do dono)
            const novas = automod.semearPalavras(guild.id);
            return await interaction.reply({
              content:
                `🚫 **${novas}** palavras proibidas adicionadas (${f.palavras.length} no total).\n` +
                `Lista: ${automod.PALAVRAS_PADRAO.join(", ")}\n` +
                `A comparação ignora acentos e pega variações (ex.: "estuprando").`,
              ephemeral: true,
            });
          }
        } else if (filtro === "semflood" || filtro === "semconvite") {
          const lista = filtro === "semflood" ? "semFlood" : "semConvite";
          if (!Array.isArray(f[lista])) f[lista] = [];
          const canalFlood = interaction.options.getChannel("canal_flood");
          if (canalFlood) {
            const idx = f[lista].indexOf(canalFlood.id);
            if (ligar === false) {
              if (idx >= 0) f[lista].splice(idx, 1);
            } else if (idx < 0) f[lista].push(canalFlood.id);
          } else if (ligar === false) {
            f[lista] = [];
          }
          automod.persistir();
          const nome = filtro === "semflood" ? "flood (texto grande)" : "bloqueio de convite";
          return await interaction.reply({
            content: f[lista].length
              ? `✅ **${f[lista].length}** canal(is) sem ${nome}: ${f[lista].map((id) => `<#${id}>`).join(" ")}`
              : `✅ Todos os canais voltaram a ter filtro de ${nome}.`,
            ephemeral: true,
          });
        } else {
          f[filtro] = ligar === false ? false : true;
          if (limite && f[`max${filtro[0].toUpperCase()}${filtro.slice(1)}`] !== undefined) {
            f[`max${filtro[0].toUpperCase()}${filtro.slice(1)}`] = limite;
          }
        }
        automod.persistir();
        return await interaction.reply({ content: `🛡️ Filtro **${filtro}** atualizado.`, ephemeral: true });
      }

      if (sub === "canal_log") {
        const canal = interaction.options.getChannel("canal", true);
        automod.setCanalLog(guild.id, canal.id);
        return await interaction.reply({ content: `📝 Logs de moderação agora vão para ${canal}.`, ephemeral: true });
      }

      if (sub === "escalar") {
        const n = interaction.options.getInteger("warns", true);
        const acao = interaction.options.getString("acao", true);
        const minutos = interaction.options.getInteger("minutos") || 10;
        cfg.escala = cfg.escala.filter((r) => r.warns !== n);
        if (acao !== "nenhuma") {
          cfg.escala.push({ warns: n, acao, ...(acao === "timeout" ? { minutos } : {}) });
        }
        automod.persistir();
        return await interaction.reply({
          content: `📈 Escala atualizada: **${n}+ warns** → ${automod.punicaoTexto({ acao, minutos }, n)}`,
          ephemeral: true,
        });
      }
    }

    if (sub === "apagar") {
      const qtd = interaction.options.getInteger("quantidade");
      const precisa = PermissionFlagsBits.ManageMessages;
      if (!interaction.member.permissions.has(precisa)) {
        return await interaction.reply({ content: "🔒 Você precisa de Gerenciar Mensagens.", ephemeral: true });
      }
      if (
        !interaction.channel
          .permissionsFor(interaction.guild.members.me)
          ?.has([precisa, PermissionFlagsBits.ViewChannel])
      ) {
        return await interaction.reply({ content: "❌ Não tenho permissão aqui.", ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      try {
        const apagadas = await interaction.channel.bulkDelete(qtd, true);
        await interaction.editReply(`🧹 Apaguei **${apagadas.size}** mensagens.`);
      } catch (err) {
        await interaction.editReply(`❌ Apagar: ${err.message}`);
      }
      return;
    }

    if (!ehMod(interaction, sub)) {
      return await interaction.reply({ content: "🔒 Você não tem permissão de moderação pra isso.", ephemeral: true });
    }
    const alvo = interaction.options.getUser("usuario", true);
    const membro = await interaction.guild.members.fetch(alvo.id).catch(() => null);
    const motivo = interaction.options.getString("motivo") || "Sem motivo informado";
    await interaction.deferReply();

    try {
      if (sub === "mute") {
        const erro = checarAlvo(interaction, alvo, membro);
        if (erro) return await interaction.editReply(`❌ ${erro}`);
        if (!membro) return await interaction.editReply(`❌ **${alvo.tag}** não está mais no servidor.`);
        if (!membro.moderatable) return await interaction.editReply(`❌ Não consigo silenciar **${alvo.tag}** (cargo acima do meu).`);
        const mins = interaction.options.getInteger("minutos", true);
        await membro.timeout(mins * 60 * 1000, `${motivo} (por ${interaction.user.tag})`);
        require("../resolucao").marcar(interaction.user.id, "mute");
        return await interaction.editReply(
          `🔇 **${alvo.tag}** silenciado por **${mins} min**.\n📄 Motivo: ${motivo}`
        );
      }

      if (sub === "kick") {
        const erro = checarAlvo(interaction, alvo, membro);
        if (erro) return await interaction.editReply(`❌ ${erro}`);
        await membro.kick(`${motivo} (por ${interaction.user.tag})`);
        return await interaction.editReply(`👢 **${alvo.tag}** foi expulso.\n📄 Motivo: ${motivo}`);
      }

      if (sub === "ban") {
        const erro = checarAlvo(interaction, alvo, membro);
        if (erro) return await interaction.editReply(`❌ ${erro}`);
        const dias = interaction.options.getInteger("apagar_dias") || 0;
        await interaction.guild.members.ban(alvo.id, {
          deleteMessageSeconds: dias * 86400,
          reason: `${motivo} (por ${interaction.user.tag})`,
        });
        return await interaction.editReply(
          `🔨 **${alvo.tag}** foi banido.${dias ? ` Mensagens de ${dias}d apagadas.` : ""}\n📄 Motivo: ${motivo}`
        );
      }
    } catch (err) {
      await interaction.editReply(`❌ Mod: ${err.message}`);
    }
  },
};
