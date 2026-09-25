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
  "civil (comum)": { id: "u", user: { id: "u", tag: "Comum#1" }, roles: { highest: cargo(190, "civil") } },
  "divulgador": { id: "di", user: { id: "di", tag: "Div#1" }, roles: { highest: cargo(212, "div") } },
  "equipe staff": { id: "eq", user: { id: "eq", tag: "Equipe#1" }, roles: { highest: cargo(210, "equipe") } },
  "ajudante": { id: "aj", user: { id: "aj", tag: "Ajud#1" }, roles: { highest: cargo(211, "ajudante") } },
  "moderador": { id: "mo", user: { id: "mo", tag: "Mod#1" }, roles: { highest: cargo(219, "moderador") } },
  "chefe admin": { id: "ad", user: { id: "ad", tag: "Admin#1" }, roles: { highest: cargo(221, "chefe") } },
  "robotizado": { id: "b", user: { id: "b", tag: "Robo#1" }, roles: { highest: cargo(ROBOTIZADO, "r2") } },
  "loremaker": { id: "lo", user: { id: "lo", tag: "Lore#1" }, roles: { highest: cargo(229, "lore") } },
  owner: { id: OWNER, user: { id: OWNER, tag: "Dono#1" }, roles: { highest: cargo(230, "cima") } },
};
const EXPECTADO = {
  "civil (comum)": false,
  divulgador: true,
  "equipe staff": false,
  ajudante: true,
  moderador: true,
  "chefe admin": true,
  robotizado: false,
  loremaker: false,
  owner: false,
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
  let falhas = 0;
  for (const [nome, m] of Object.entries(alvos)) {
    members.fetch = async () => m;
    am.limparWarns(G, m.user.id, true);
    const r = await am.darWarn(guild, m.user, "teste", null, { automatico: true, tipo: "filtro", member: m });
    const ok = !!r.dobro === EXPECTADO[nome];
    if (!ok) falhas++;
    console.log(
      `${ok ? "OK   " : "FALHOU"} ${nome.padEnd(15)} topo=${String(m.roles.highest.position).padStart(3)}  warn=${String(r.warn).padStart(2)}  dobro=${r.dobro ? "SIM" : "nao"}`
    );
    am.limparWarns(G, m.user.id, true);
  }
  console.log("\nregra: dobra so a faixa ENTRE Equipe Staff (210) e Robotizado (222), owner nunca");
  console.log(falhas === 0 ? "TUDO OK" : `${falhas} FALHAS`);

  console.log("\n=== escada: comum (passo 1) vs staff (passo 2) ===");
  for (const [nome, alvo] of [["comum", alvos["civil (comum)"]], ["staff", alvos.moderador]]) {
    members.fetch = async () => alvo;
    am.limparWarns(G, alvo.user.id, true);
    const linhas = [];
    for (let i = 1; i <= 5; i++) {
      const r = await am.darWarn(guild, alvo.user, `infracao ${i}`, null, { automatico: true, tipo: "filtro", member: alvo });
      linhas.push(`${String(r.warn).padStart(2)}=${r.punicao ? `${r.punicao.warns}º(aviso)` : "--"}`);
    }
    console.log(`  ${nome.padEnd(6)} contador apos cada infração: ${linhas.join("  ")}`);
    am.limparWarns(G, alvo.user.id, true);
  }
  const d = am.carregar();
  delete d.servidores[G];
  delete d.pendentes[G];
  am.persistir();
})();
