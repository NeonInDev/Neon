const automod = require("../automod");
const { log } = require("../logger");

module.exports = {
  name: "guildMemberAdd",
  async execute(member) {
    try {
      const guild = member.guild;
      if (!guild || member.user.bot) return;
      const cfg = automod.configGuild(guild.id);
      if (!cfg.enabled || !cfg.antiraid.ativo) return;

      const r = automod.registrarJoin(guild, member);
      if (!r) return;

      if (!r.contaNova) return;
      await automod.registrarLog(guild, {
        cor: 0xe74c3c,
        titulo: "🚨 Antiraid: entrada suspeita",
        campos: {
          Usuário: `${member.user.tag}\n\`${member.id}\``,
          "Entradas na janela": `${r.total}`,
          "Conta criada em": `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
          Ação: cfg.antiraid.acao,
        },
      });
      log("WARN", "[ANTIRAID] entrada detectada", { guild: guild.name, usuario: member.id, total: r.total });
    } catch (err) {
      log("ERROR", "[ANTIRAID] erro", { guild: member?.guild?.name, erro: err.message });
    }
  },
};
