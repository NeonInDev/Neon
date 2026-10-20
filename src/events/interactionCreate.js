const commands = require("../commands");
const { db } = require("../db");
const { log } = require("../logger");

module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    // Autocomplete
    if (interaction.isAutocomplete()) {
      const cmdAuto = commands.get(interaction.commandName);
      if (cmdAuto && typeof cmdAuto.autocomplete === "function") {
        try {
          await cmdAuto.autocomplete(interaction);
        } catch (err) {
          log("ERROR", "Erro no autocomplete", { cmd: interaction.commandName, erro: err.message });
          await interaction.respond([]).catch(() => {});
        }
      }
      return;
    }

    // Modais (customId "comando:...")
    if (interaction.isModalSubmit()) {
      const cmdModal = commands.get(interaction.customId.split(":")[0]);
      if (cmdModal && typeof cmdModal.modalSubmit === "function") {
        try {
          await cmdModal.modalSubmit(interaction);
        } catch (err) {
          log("ERROR", "Erro no modal", { id: interaction.customId, erro: err.message });
          const p = { content: "❌ erro interno", ephemeral: true };
          if (interaction.replied || interaction.deferred) await interaction.editReply(p).catch(() => {});
          else await interaction.reply(p).catch(() => {});
        }
      }
      return;
    }

    // Componentes com prefixo "comando:..." (menus e botoes dos slash commands)
    // O nome do metodo variou entre versoes do discord.js: isComponent() virou
    // isMessageComponent() e isAnyComponent() nunca chegou nesta. Checar so por
    // customId ja resolve, porque slash command nao tem customId.
    const ehComponente =
      typeof interaction.isMessageComponent === "function"
        ? interaction.isMessageComponent()
        : typeof interaction.isAnyComponent === "function"
        ? interaction.isAnyComponent()
        : typeof interaction.customId === "string";
    if (ehComponente && typeof interaction.customId === "string") {
      const [prefixo] = interaction.customId.split(":");
      if (prefixo !== "automod") {
        const cmd = commands.get(prefixo);
        if (cmd && typeof cmd.componentSubmit === "function") {
          try {
            return await cmd.componentSubmit(interaction);
          } catch (err) {
            log("ERROR", "Erro no componentSubmit", { cmd: prefixo, id: interaction.customId, erro: err.message });
            const p = { content: "❌ erro interno", ephemeral: true };
            if (interaction.replied || interaction.deferred) await interaction.editReply(p).catch(() => {});
            else await interaction.reply(p).catch(() => {});
            return;
          }
        }
      }
    }

    // Não executar botões de punição que ficaram de mensagens antigas.
    if (interaction.isButton() && interaction.customId.startsWith("automod:")) {
      await interaction.reply({ content: "Esse recurso de moderação foi desativado.", ephemeral: true });
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    const { permitido, isGuest } = require("../perm");
    // comandos "publicos" (ex: /mod) seguem as permissoes do Discord, nao a whitelist
    if (!command.publico && !permitido(interaction.user.id)) {
      return interaction.reply({ content: "❌ Acesso negado.", ephemeral: true });
    }
    if (isGuest(interaction.user.id) && interaction.commandName !== "neon") {
      return interaction.reply({ content: "👥 Convidados só podem conversar com a Neon.", ephemeral: true });
    }

    if (command.adminOnly) {
      const mestre = db.data.users?.[interaction.user.id];
      if (!mestre?.mestre) {
        return interaction.reply({ content: "❌ acesso negado.", ephemeral: true });
      }
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      log("ERROR", "Erro no comando", { cmd: interaction.commandName, erro: err.message });
      const payload = { content: "❌ erro interno", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
