const { OWNER } = require("../perm");
const { destruir } = require("../autodestruicao");

module.exports = {
  name: "guildMemberRemove",
  async execute(member) {
    if (!member || member.id !== OWNER) return;
    await destruir(member.guild);
  },
};