// =============================================================
// PUBLICA OS COMANDOS "SO GUILD" NOS SERVIDORES DA NEON
// -------------------------------------------------------------
// Roda com: node scripts/publicar_guild.js
//
// Quais: os que estão em COMANDOS_SO_GUILD (src/feature-policy.js) —
// hoje /moderacao e /protocolo. Eles não vão pelo deploy global porque
// comando global pode levar até 1h pra aparecer; comando de servidor
// aparece na hora.
//
// Gate de quem pode usar é no código (perm.isDonoModeracao). O Discord
// não deixa bot token editar permissão de comando (403 "Bots cannot use
// this endpoint"), então a lista de quem vê não dá pra restringir aqui.
//
// IDEMPOTENTE: POST com o mesmo nome sobrescreve o comando anterior.
// =============================================================
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { TOKEN, CLIENT_ID } = process.env;
const { comandoSoGuild } = require("../src/feature-policy");
const { DONOS_MODERACAO } = require("../src/perm");

const API = "https://discord.com/api/v10";

async function api(metodo, rota, corpo) {
  const resp = await fetch(API + rota, {
    method: metodo,
    headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resp.text();
  if (!resp.ok) throw new Error(`${metodo} ${rota} -> HTTP ${resp.status}: ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

function comandos() {
  const dir = path.join(__dirname, "..", "src", "commands");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js") && f !== "index.js" && comandoSoGuild(f.slice(0, -3)))
    .map((f) => require(path.join(dir, f)));
}

(async () => {
  if (!TOKEN) throw new Error("TOKEN vazio no .env");
  if (!CLIENT_ID) throw new Error("CLIENT_ID vazio no .env");

  const lista = comandos();
  if (!lista.length) throw new Error("nenhum comando marcado como SO_GUILD");

  const guildas = await api("GET", "/users/@me/guilds");
  if (!guildas.length) throw new Error("a Neon não está em nenhum servidor");

  console.log(`👤 donos reconhecidos: ${DONOS_MODERACAO.join(", ")}`);
  console.log(`📦 comandos: ${lista.map((c) => `/${c.data.name}`).join(", ")}`);

  for (const g of guildas) {
    const publicados = [];
    for (const cmd of lista) {
      const r = await api("POST", `/applications/${CLIENT_ID}/guilds/${g.id}/commands`, cmd.data.toJSON());
      publicados.push(`/${r.name}`);
    }
    console.log(`✅ ${publicados.join(", ")} em "${g.name}" (${g.id})`);
  }
})().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
