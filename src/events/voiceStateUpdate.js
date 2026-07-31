const { log } = require("../logger");
const { OWNER } = require("../perm");

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState) {
    const userId = newState.member?.id || oldState.member?.id;
    if (userId !== OWNER) return;

    const voz = require("../voz");
    const guildId = newState.guild?.id || oldState.guild?.id;
    if (!guildId) return;

    const entrou = newState.channelId && newState.channelId !== oldState.channelId;

    if (entrou && newState.channel) {
      log("INFO", "[VC] Dono entrou no canal, seguindo", { canal: newState.channel.name });
      const adapter = newState.guild.voiceAdapterCreator;
      await voz.entrarVoz(guildId, newState.channelId, adapter);
    }

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
