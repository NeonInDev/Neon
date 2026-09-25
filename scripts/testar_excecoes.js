const am = require("../src/automod");
const G = "1498162375251988624";
const c = am.configGuild(G);
if (!Array.isArray(c.filtros.excecoes)) c.filtros.excecoes = [];
c.filtros.excecoes = ["cabelo preto"];
c.enabled = true;
c.filtros.ativo = true;
am.persistir();

const guild = {
  id: G,
  name: "t",
  ownerId: "o",
  client: { user: { id: "b" } },
  members: { fetch: async () => null },
  channels: { cache: new Map() },
};

let s = 0;
function mk(t) {
  return {
    guild,
    content: t,
    author: { id: "u" + s++, username: "x", globalName: null, bot: false },
    member: { id: "u", roles: { cache: { some: () => false } }, permissions: { has: () => false }, user: { bot: false } },
    channel: { id: "c" + s++, name: "g" },
    mentions: { users: new Map(), roles: new Map() },
    delete: async () => true,
  };
}

for (const t of [
  "o cabelo preto dele e bonito",
  "ele me chamou de macaco",
  "ele e preto de pele",
  "isso e preto e branco",
]) {
  const v = am.checarMensagem(mk(t));
  console.log((v ? "BLOQUEADO  " : "liberado   ") + '"' + t + '"' + (v ? "  -> " + v.palavra : ""));
}

c.filtros.excecoes = [];
am.persistir();
console.log("\nexcecoes de teste removidas");
