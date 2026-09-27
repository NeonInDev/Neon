const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { readdirSync } = require("fs");
const { join } = require("path");
const { log } = require("./logger");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildBans,
  ],
  // GuildMember e obrigatorio: em servidores grandes (>250) o Discord faz
  // lazy loading de membros e, sem o partial, message.member chega null
  // (quebrava os comandos por fala natural com "reading 'permissions'").
  partials: [Partials.Channel, Partials.GuildMember],
});

const eventFiles = readdirSync(join(__dirname, "events")).filter((f) => f.endsWith(".js"));
for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) client.once(event.name, (...args) => event.execute(...args));
  else client.on(event.name, (...args) => event.execute(...args));
}

// Erros de gateway chegavam aqui e saiam como uma linha generica com a
// mensagem crua. Token invalido ou intent nao habilitado nesse caso matam a
// Neon silenciosamente: o processo continua vivo, o start.bat nao relanca
// (porque a API ainda responde) e nobody loga nada. Aqui a gente separa o que
// e critico e diz o que fazer.
const CRITICOS = [
  { tag: "TOKEN_INVALIDO",  teste: /invalid token|An invalid token was provided|TokenInvalid/i,
    dica: "O token foi revogado/alterado no portal do Discord. Troque TOKEN no .env e reinicie." },
  { tag: "INTENT_NEGADO",   teste: /disallowed intent|privileged intent|DisallowedIntents/i,
    dica: "Faltou intent privilegiado ligado no portal do Discord (GUILD_MEMBERS, GUILD_MESSAGE_CONTENT ou GUILD_VOICE_STATES)." },
  { tag: "TOKEN_SEM_PERMISSAO", teste: /Missing Access|401: Unauthorized/i,
    dica: "O bot nao tem acesso a este recurso. Confira se ele ainda esta no servidor." },
  { tag: "SHARD_ERRO",      teste: /shard/i,
    dica: "Erro de shard. Costuma se recuperar sozinho; se repetir, reinicie a Neon." },
];

client.on("error", (err) => {
  const msg = String(err?.message || err);
  const critico = CRITICOS.find((c) => c.teste.test(msg));

  if (critico) {
    log("ERROR", `[CRITICO] ${critico.tag} - a Neon pode ter parado de funcionar`, { erro: msg, solucao: critico.dica });
    return;
  }
  log("ERROR", "Erro na conexão do Discord", { erro: msg });
});

// Se o token for invalido o login falha e o processo morre, mas o start.bat
// so reinicia se a API 3000 cair. Com o token quebrado a API continua no ar e
// o laco de restart nunca dispara, entao a Neon fica morta ate alguem olhar o
// log. Este aviso deixa o problema visivel no proprio boot.
client.on("shardDisconnect", (event, shardId) => {
  log("WARN", "[SHARD] Desconectado do Discord, reconectando sozinho", { shardId, code: event?.code });
});
client.on("shardReconnecting", (shardId) => {
  log("INFO", "[SHARD] Reconectando ao Discord", { shardId });
});

client.on("warn", (msg) => log("WARN", msg));

module.exports = { client };
