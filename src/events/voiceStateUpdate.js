const { log } = require("../logger");

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState) {
    const voz = require("../voz");
    const guildId = newState.guild?.id || oldState.guild?.id;
    if (!guildId) return;

    // Auto-join desativado: a Neon NÃO acompanha o dono para calls.
    // Ela só entra por comando manual (/entrar, /conversar).

    if (!newState.channelId && oldState.channelId) {
      const botState = newState.guild.members.me.voice;
      if (!botState?.channelId) return;
      const members = botState.channel?.members.filter(m => !m.user.bot).size || 0;
      if (members === 0) {
        log("INFO", "[VC] Sozinha, saindo");
        await voz.sairVoz(guildId);
      }
    }
  },
};
