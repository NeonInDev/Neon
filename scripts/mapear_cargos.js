// Lista cargos e canais do New Genesis pra mapear o sistema de punishment
// (Arcane, ranque, controle) sem adivinhar nome.
require("dotenv").config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");
const { log } = require("../src/logger");

const GUILD = "1498162375251988624";

const c = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: ["Channel"],
});

c.once("ready", async () => {
  const g = c.guilds.cache.get(GUILD);
  if (!g) {
    console.log("guild nao encontrada no cache");
    process.exit(1);
  }
  const roles = [...g.roles.cache.values()].sort((a, b) => b.position - a.position);
  console.log("=== CARGOS (position | nome | id) ===");
  for (const r of roles) {
    if (r.id === g.id) continue;
    console.log(`  ${String(r.position).padStart(3)} | ${r.name} | ${r.id} | membros=${r.members?.count ?? "?"}`);
  }
  console.log("\n=== CANAIS DE TEXTO ===");
  for (const ch of g.channels.cache.values()) {
    if (ch.isTextBased()) console.log(`  ${ch.name} | ${ch.id}`);
  }
  console.log("\nmeu topo de cargo:", g.members.me.roles.highest.position, "| admin?", g.members.me.permissions.has(PermissionFlagsBits.Administrator));

  // dump em JSON (Node escreve UTF-8 certo; powershell corrompe o nome)
  const fs = require("fs");
  const path = require("path");
  fs.writeFileSync(
    path.join(__dirname, "..", "data", "cargos_new_genesis.json"),
    JSON.stringify(roles.map((r) => ({ nome: r.name, id: r.id, position: r.position })), null, 2)
  );
  console.log("-> data/cargos_new_genesis.json");
  c.destroy();
  process.exit(0);
});

c.login(process.env.TOKEN);
setTimeout(() => {
  console.log("timeout");
  process.exit(1);
}, 45000);
