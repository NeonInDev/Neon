const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType, PermissionFlagsBits } = require("discord.js");
const { log } = require("../logger");

const BACKUP_DIR = path.join(__dirname, "..", "..", "backups");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Faz backup da estrutura do servidor (canais, cargos, membros, permissões)")
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .addSubcommand((s) =>
      s.setName("criar").setDescription("Cria um backup completo do servidor atual")
    )
    .addSubcommand((s) =>
      s.setName("listar").setDescription("Lista os backups salvos")
    )
    .addSubcommand((s) =>
      s.setName("restaurar").setDescription("Restaura um backup no servidor atual (recria canais e cargos)")
        .addStringOption((o) => o.setName("arquivo").setDescription("Nome do arquivo de backup (ex.: 1700000000000-my-guild.json)").setRequired(true))
    ),
  adminOnly: true,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "listar") return listar(interaction);

    if (!interaction.inGuild()) {
      return interaction.reply({ content: "❌ Precisa usar dentro do servidor.", ephemeral: true });
    }
    const guild = interaction.guild;

    if (sub === "criar") return criar(interaction, guild);
    if (sub === "restaurar") return restaurar(interaction, guild);
    return interaction.reply("❌ Subcomando inválido.");
  },
};

function listar(interaction) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const arquivos = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".json"));
  if (!arquivos.length) {
    return interaction.reply("📭 Nenhum backup salvo ainda. Use `/backup criar`.");
  }
  const linhas = arquivos.slice(-15).reverse().map((f) => {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f), "utf8"));
      const data = new Date(meta.criadoEm).toLocaleString("pt-BR");
      const canais = (meta.canais || []).length;
      const cargos = (meta.cargos || []).length;
      const membros = (meta.membros || []).length;
      return `• \`${f}\` — ${data} · ${canais} canais · ${cargos} cargos · ${membros} membros`;
    } catch {
      return `• \`${f}\` — (arquivo corrompido)`;
    }
  });
  return interaction.reply(`📦 **Backups salvos** (últimos 15):\n${linhas.join("\n")}`);
}

async function criar(interaction, guild) {
  await interaction.deferReply();

  try {
    const canais = [];
    for (const c of guild.channels.cache.values()) {
      canais.push({
        id: c.id,
        name: c.name,
        type: c.type,
        parentId: c.parentId,
        position: c.position,
        topic: c.topic || null,
        nsfw: c.nsfw || false,
        bitrate: c.bitrate || null,
        userLimit: c.userLimit || null,
        rateLimitPerUser: c.rateLimitPerUser || 0,
        permissionOverwrites: c.permissionOverwrites?.cache.map((p) => ({
          id: p.id,
          type: p.type,
          allow: String(p.allow || 0),
          deny: String(p.deny || 0),
        })) || [],
      });
    }

    const cargos = [];
    for (const r of guild.roles.cache.values()) {
      cargos.push({
        id: r.id,
        name: r.name,
        color: r.hexColor || null,
        hoist: r.hoist,
        position: r.position,
        mentionable: r.mentionable,
        permissions: String(r.permissions || 0),
        managed: r.managed,
      });
    }

    const membros = [];
    guild.members.cache.forEach((m) => {
      membros.push({
        id: m.id,
        tag: m.user ? m.user.tag : m.id,
        nickname: m.nickname || null,
        roles: m.roles.cache.map((r) => r.id),
        joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
        bot: !!(m.user && m.user.bot),
      });
    });

    const emojis = guild.emojis.cache.map((e) => ({ id: e.id, name: e.name, animated: e.animated }));
    const stikers = guild.stickers?.cache.map((s) => ({ id: s.id, name: s.name, format: s.format })) || [];

    const backup = {
      guild: { id: guild.id, name: guild.name, description: guild.description || null },
      criadoEm: new Date().toISOString(),
      canais,
      cargos,
      membros,
      emojis,
      stikers,
      config: {
        verificationLevel: guild.verificationLevel,
        defaultMessageNotifications: guild.defaultMessageNotifications,
        explicitContentFilter: guild.explicitContentFilter,
        premiumTier: guild.premiumTier,
      },
    };

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const nomeArquivo = `${Date.now()}-${guild.name.replace(/[^a-z0-9-_]/gi, "")}.json`;
    const caminho = path.join(BACKUP_DIR, nomeArquivo);
    fs.writeFileSync(caminho, JSON.stringify(backup, null, 2), "utf8");

    log("INFO", "Backup de servidor criado", { guild: guild.name, arquivo: nomeArquivo, canais: canais.length, cargos: cargos.length });
    return interaction.editReply(`✅ **Backup criado!**\n📦 Arquivo: \`backups/${nomeArquivo}\`\n• ${canais.length} canais\n• ${cargos.length} cargos\n• ${membros.length} membros\n• ${emojis.length} emojis`);
  } catch (err) {
    log("ERROR", "Falha ao criar backup", { erro: err.message });
    return interaction.editReply(`❌ Erro ao criar backup: ${err.message}`);
  }
}

async function restaurar(interaction, guild) {
  const nome = interaction.options.getString("arquivo");
  const caminho = path.join(BACKUP_DIR, path.basename(nome));
  if (!fs.existsSync(caminho)) {
    return interaction.reply(`❌ Backup \`${nome}\` não encontrado. Use \`/backup listar\` pra ver os disponíveis.`);
  }

  let backup;
  try {
    backup = JSON.parse(fs.readFileSync(caminho, "utf8"));
  } catch {
    return interaction.reply("❌ Arquivo de backup corrompido.");
  }

  const botMe = guild.members.me;
  if (!botMe?.permissions.has(PermissionFlagsBits.ManageChannels) || !botMe?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply("❌ A Neon precisa das permissões **Gerenciar Canais** e **Gerenciar Cargos** pra restaurar.");
  }

  const contagem = {
    canais: (backup.canais || []).length,
    cargos: (backup.cargos || []).length,
  };

  const msg = await interaction.reply({
    content: `⚠️ **Restaurar backup?** Vou recriar **${contagem.canais} canais** e **${contagem.cargos} cargos** do backup \`${nome}\` no servidor atual.\n\n🔴 Canais e cargos existentes serão **mantidos** (sem apagar). Responda com **confirmar** nesse chat em 30s pra prosseguir.\n\n📝 *O backup foi feito em ${new Date(backup.criadoEm).toLocaleString("pt-BR")} do servidor ${backup.guild?.name || "desconhecido"}.*`,
  });

  try {
    const resposta = await interaction.channel.awaitMessages({
      filter: (m) => m.author.id === interaction.user.id && m.content.toLowerCase().startsWith("confirmar"),
      max: 1,
      time: 30000,
      errors: ["time"],
    });

    const confirm = resposta.first();
    let criados = { canais: 0, cargos: 0, erros: [] };

    for (const c of (backup.canais || [])) {
      try {
        await guild.channels.create({
          name: c.name,
          type: c.type,
          parent: c.parentId ? guild.channels.cache.get(c.parentId)?.id : undefined,
          topic: c.topic || undefined,
          nsfw: c.nsfw || false,
          bitrate: c.bitrate || undefined,
          userLimit: c.userLimit || undefined,
          rateLimitPerUser: c.rateLimitPerUser || 0,
          permissionOverwrites: (c.permissionOverwrites || []).map((p) => ({
            id: p.id,
            type: p.type,
            allow: BigInt(p.allow || 0),
            deny: BigInt(p.deny || 0),
          })),
        });
        criados.canais++;
      } catch (err) {
        criados.erros.push(`canal ${c.name}: ${err.message}`);
      }
    }

    for (const r of (backup.cargos || [])) {
      try {
        if (r.managed) continue;
        await guild.roles.create({
          name: r.name,
          color: r.color || null,
          hoist: r.hoist || false,
          mentionable: r.mentionable || false,
          permissions: BigInt(r.permissions || 0),
        });
        criados.cargos++;
      } catch (err) {
        criados.erros.push(`cargo ${r.name}: ${err.message}`);
      }
    }

    const resumo = `✅ **Restauração concluída!**\n• ${criados.canais} canais criados\n• ${criados.cargos} cargos criados`;
    const errosTex = criados.erros.length ? `\n\n⚠️ ${criados.erros.length} erro(s):\n${criados.erros.slice(0, 10).map((e) => `• ${e}`).join("\n")}` : "";
    await confirm.reply(resumo + errosTex);
    log("INFO", "Backup restaurado", { guild: guild.name, arquivo: nome, criados });
  } catch {
    return interaction.channel.send("⏰ Tempo esgotado. Restauração cancelada.");
  }
}