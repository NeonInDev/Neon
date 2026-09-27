// Antes nao existia nenhum handler de guildRemove: quando a Neon saia de um
// servidor (expulsa, removida pelo dono, ou caiu durante uma queda de shard) o
// processo nao logava nada. Foi assim que ela saiu do servidor
// 1536726615470645330 sem deixar rastro -- só deu pra notar porque a contagem
// de servidores no boot seguinte veio menor.
//
// available = false  -> o Discord marcou o guild como indisponivel (queda de
//                       shard / outage). Costuma voltar sozinho: nao e saida.
// available = true   -> ela saiu de verdade (kick ou dono removeu). So o
//                       audit log do servidor explica quem.
const { log } = require("../logger");

module.exports = {
  name: "guildRemove",
  execute(guild) {
    const base = {
      guildId: guild.id,
      guild: guild.name,
      available: guild.available,
      servidoresRestantes: guild.client.guilds.cache.size,
    };

    if (guild.available === false) {
      log("WARN", "[GUILD] Servidor marcado como indisponivel (queda do Discord, nao e saida)", base);
      return;
    }

    log("ERROR", "[GUILD] NEON FOI REMOVIDA DESTE SERVIDOR", base);
    log("ERROR", "[GUILD] Quem removeu so aparece no Log de Auditoria do Discord: Configuracoes do servidor -> Log de Auditoria", base);
  },
};
