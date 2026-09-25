// Conta dobrada: cargo abaixo do "Robotizado" (cargo da Neon) = 2 warns.
// Staff (acima ou igual) = 1 warn. Owner = nunca conta.
const am = require("../src/automod");

const G = "999999999999999999";
const ROBOTIZADO = 222; // cargo da Neon
const OWNER = "o-dono";

function cacheFalso(itens) {
  const arr = [...itens];
  arr.get = (id) => arr.find((x) => x.id === id) || null;
  arr.has = (id) => arr.some((x) => x.id === id);
  return arr;
}

function cargo(pos, id) {
  return { id, position: pos, name: `cargo${pos}` };
}

const meuCargo = cargo(ROBOTIZADO, "robotizado");
const meuRoles = cacheFalso([meuCargo]);
meuRoles.highest = meuCargo;
const me = { user: { id: "neon" }, roles: meuRoles };
const members = { me, cache: cacheFalso([]) };
members.cache.get = (id) => {
  if (id === OWNER) return { id: OWNER, user: { id: OWNER, tag: "Dono#1", send: async () => {} } };
  return null;
};

const guild = {
  id: G, name: "teste", ownerId: OWNER, client: { user: { id: "neon" } },
  members, channels: { cache: cacheFalso([]) },
};

const alvos = {
  membro: { id: "u", user: { id: "u", tag: "Comum#1" }, roles: { highest: cargo(190, "civil") } },
  moderador: { id: "mo", user: { id: "mo", tag: "Mod#1" }, roles: { highest: cargo(219, "moderador") } },
  admin: { id: "ad", user: { id: "ad", tag: "Admin#1" }, roles: { highest: cargo(221, "chefe") } },
  robot: { id: "b", user: { id: "b", tag: "Robo#1" }, roles: { highest: cargo(ROBOTIZADO, "r2") } },
  loremaker: { id: "lo", user: { id: "lo", tag: "Lore#1" }, roles: { highest: cargo(229, "lore") } },
  owner: { id: OWNER, user: { id: OWNER, tag: "Dono#1" }, roles: { highest: cargo(230, "cima") } },
};
for (const m of Object.values(alvos)) {
  m.guild = guild;
  m.user.send = async () => {};
  m.user.bot = false;
  m.moderatable = true;
  m.permissions = { has: () => false };
}

for (const [nome, m] of Object.entries(alvos)) {
  members.fetch = async (id) => (m.user.tag && id === OWNER ? m : m);
}

(async () => {
  for (const [nome, m] of Object.entries(alvos)) {
    members.fetch = async () => m;
    am.limparWarns(G, m.user.id, true);
    const r = await am.darWarn(guild, m.user, "teste", null, { automatico: true, tipo: "filtro", member: m });
    console.log(
      `${nome.padEnd(7)} topo=${String(m.roles.highest.position).padStart(3)}  ->  warn=${String(r.warn).padStart(2)}  dobro=${r.dobro ? "SIM" : "nao"}`
    );
    am.limparWarns(G, m.user.id, true);
  }
  console.log("\nregra: tudo ABAIXO do Robotizado (222) conta dobrado, owner nunca conta");

  // a escada anda em dobrado: 1 infracao de membro comum ja pega 2 avisos
  members.fetch = async () => alvos.membro;
  am.limparWarns(G, "u", true);
  console.log("\n=== escada de um membro comum (passo 2) ===");
  for (let i = 1; i <= 5; i++) {
    const r = await am.darWarn(guild, alvos.membro.user, `infracao ${i}`, null, { automatico: true, tipo: "filtro", member: alvos.membro });
    const nivel = r.punicao ? `${r.punicao.warns}º aviso` : "nenhum";
    const mute = r.punicao?.minutos ? `${Math.round(r.punicao.minutos / 60)}h` : "-";
    const controle = r.punicao?.controle !== undefined ? `${r.punicao.controle}%` : "-";
    console.log(`  ${i}ª infração -> contador=${String(r.warn).padStart(2)} | ${nivel} | mute ${mute} | controle ${controle}`);
  }
  am.limparWarns(G, "u", true);
  const d = am.carregar();
  delete d.servidores[G];
  delete d.pendentes[G];
  am.persistir();
})();
