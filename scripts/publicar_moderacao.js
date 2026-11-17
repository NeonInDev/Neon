// =============================================================
// PUBLICA /moderacao NOS SERVIDORES ONDE A NEON ESTÁ
// -------------------------------------------------------------
// Roda com: node scripts/publicar_moderacao.js
//
// Por que não vai pelo deploy-commands.js: comando global pode levar
// até 1h pra aparecer. O comando de servidor aparece na hora.
//
// Sobre esconder de quem não é dono: o Discord não deixa bot token
// editar permissão de comando (403 "Bots cannot use this endpoint"),
// então a restrição é feita no código (perm.isDonoModeracao). Para
// esconder da lista também: Configurações do Servidor > Integrações >
// Neon > /moderacao > adicionar só os donos.
//
// IDEMPOTENTE: POST com o mesmo nome sobrescreve o comando anterior.
// =============================================================
require("dotenv").config();
const path = require("path");
const { TOKEN, CLIENT_ID } = process.env;
const { DONOS_MODERACAO } = require(path.join(__dirname, "..", "src", "perm"));

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

(async () => {
  if (!TOKEN) throw new Error("TOKEN vazio no .env");
  if (!CLIENT_ID) throw new Error("CLIENT_ID vazio no .env");

  const cmd = require(path.join(__dirname, "..", "src", "commands", "moderacao"));
  const corpo = cmd.data.toJSON();

  const guildas = await api("GET", "/users/@me/guilds");
  if (!guildas.length) throw new Error("a Neon não está em nenhum servidor");

  console.log(`👤 donos reconhecidos: ${DONOS_MODERACAO.join(", ")}`);

  for (const g of guildas) {
    const publicado = await api("POST", `/applications/${CLIENT_ID}/guilds/${g.id}/commands`, corpo);
    console.log(`✅ /${publicado.name} em "${g.name}" (${g.id}) — execução restrita ao dono (no código)`);
  }
})().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
