const am = require("../src/automod");
const G = "1498162375251988624";
const PARCERIAS = "1498178365923000390";
const f = am.configGuild(G).filtros;

const guild = {
  id: G,
  name: "t",
  ownerId: "o",
  client: { user: { id: "b" } },
  members: { fetch: async () => null },
  channels: { cache: new Map() },
};

let s = 0;
function mk(t, canalId) {
  return {
    guild,
    content: t,
    author: { id: "spam" + s, username: "spam" + s, globalName: null, bot: false },
    member: {
      id: "spam" + s,
      roles: { cache: { some: () => false } },
      permissions: { has: () => false },
      user: { bot: false },
    },
    channel: { id: canalId, name: canalId === PARCERIAS ? "parcerias" : "chat-geral" },
    mentions: { users: new Map(), roles: new Map() },
    delete: async () => true,
  };
}

console.log("=== flood (mesmo usuario, 12 mensagens) ===");
let chat = 0;
let par = 0;
for (let i = 0; i < 12; i++) {
  s = 0; // mesmo usuario, senao nao ha flood
  if (am.checarMensagem(mk("texto normal " + i, "chatGERAL"))?.tipo === "flood") chat++;
  s = 0;
  if (am.checarMensagem(mk("anuncio " + i, PARCERIAS))?.tipo === "flood") par++;
}
console.log("chat-geral: flood em " + chat + "/12  (esperado: > 0, deve barrar)");
console.log("parcerias : flood em " + par + "/12  (esperado: 0, imune)");

console.log("\n=== convite no chat de parcerias ===");
s = 99;
const convitePar = am.checarMensagem(mk("PARCERIA: https://discord.gg/abc123", PARCERIAS));
console.log("parcerias : " + (convitePar ? "BLOQUEADO (" + convitePar.tipo + ")" : "liberado (imune)"));
s = 98;
const convChat = am.checarMensagem(mk("entra https://discord.gg/abc123", "chatGERAL"));
console.log("chat-geral: " + (convChat ? "BLOQUEADO (" + convChat.tipo + ")" : "liberado"));

console.log("\n=== palavra em contexto de parceria (vai pro verificador de IA) ===");
s = 97;
const v = am.checarMensagem(mk("ficha: Kaio, cabelo preto, 18 anos", PARCERIAS));
console.log("violacao: " + (v ? v.tipo + ' ("' + v.palavra + '") -> IA decide' : "nenhuma"));
