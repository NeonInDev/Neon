const { log } = require("./logger");
const { client } = require("./client");

async function enviarParaDono(texto) {
  try {
    const { OWNER } = require("./perm");
    const user = await client.users.fetch(OWNER);
    if (user) {
      await user.send(texto);
      return true;
    }
  } catch (err) {
    log("WARN", "[DM] Erro ao enviar DM", { erro: err.message });
  }
  return false;
}

module.exports = { enviarParaDono };
