// 1) as 6 palavras novas + burla (d1ddy, D.i.d.d.y, 3pst31n)
// 2) a escada do dono: mute, % no nick, ranque nos atributos, arcane
const am = require("../src/automod");
const pun = require("../src/punicoes");

const G = "999999999999999999";
function cacheFalso(itens) {
  const arr = [...itens];
  arr.get = (id) => arr.find((x) => x.id === id) || null;
  arr.has = (id) => arr.some((x) => x.id === id);
  return arr;
}
const guild = {
  id: G, name: "teste", ownerId: "o", client: { user: { id: "b" } },
  members: { cache: cacheFalso([]), fetch: async () => null, ban: async () => {} },
  channels: { cache: cacheFalso([]) },
};
am.setCanalLog(G, "x");
const cfg = am.configGuild(G);
cfg.enabled = true;
cfg.filtros.ativo = true;
cfg.filtros.contextoIa = false;
cfg.filtros.palavras = am.PALAVRAS_PADRAO.slice();
am.persistir();

function pega(t) {
  const m = {
    guild, content: t,
    author: { id: "u", username: "u", globalName: null, bot: false },
    member: { id: "u", roles: cacheFalso([]), permissions: { has: () => false }, user: { bot: false }, moderatable: true, guild },
    channel: { id: "c", name: "chat", send: async () => {} },
    mentions: { users: new Map(), roles: new Map() },
    delete: async () => true,
  };
  am.aplicarNoMembro(m, m.member);
  const v = am.checarMensagem(m);
  return v && v.tipo === "palavraProibida" ? v : null;
}

console.log("=== 1. palavras novas ===");
for (const t of ["o diddy foi preso", "fala de kid bengala", "o jeffrey epstein", "epstein morreu", "stu pro no server", "stu prado"]) {
  const v = pega(t);
  console.log(`  ${v ? "BARRADO" : "PASSOU "} "${t}"${v ? ` -> "${v.palavra}" burlado=${v.burlado}` : ""}`);
}

console.log("\n=== 2. burla (nao pode escapar) ===");
const buradas = ["d1ddy", "D.i.d.d.y", "D1DDY", "d-i-d-d-y", "3pst31n", "3pstein", "j3ffr3y", "k1d b3ngala", "stu_pr0", "5tu prado", "3ps7ein", "k.i.d b3ng4la", "d1ddy ae", "epstein", "spstein"];
for (const t of buradas) {
  const v = pega(`olha isso ${t} ae`);
  console.log(`  ${v && v.burlado ? "DETECTADO" : v ? "normal   " : "ESCAPOU !"} "${t}"${v ? ` -> "${v.palavra}"` : ""}`);
}
console.log("\n  --- nao pode dar falso positivo de burla ---");
for (const t of ["meu casaco", "minha casa", "o mac arranhou", "casa cota", "kid watches", "pro max", "diddy-less", "aula de prostica"]) {
  const v = pega(t);
  console.log(`  ${v ? "CASSOU (ruim)" : "ok        "} "${t}"${v ? ` -> "${v.palavra}" burlado=${v.burlado}` : ""}`);
}

console.log("\n=== 3. escada do dono ===");
for (const r of pun.ESCALA_PUNICAO) {
  const partes = [];
  if (r.minutos) partes.push(`${Math.round(r.minutos / 60)}h`);
  if (r.controle !== undefined) partes.push(`controle ${r.controle}%`);
  if (r.arcane) partes.push(`arcane ${r.arcane}`);
  if (r.ranques) partes.push(`-${r.ranques} ranques`);
  if (r.tetoRank) partes.push(`teto ${r.tetoRank}`);
  if (r.acao) partes.push(r.acao.toUpperCase());
  console.log(`  ${String(r.warns).padStart(2)}º aviso: ${partes.join(" | ") || "nada"}`);
}

console.log("\n=== 4. controle no nick: so pode descer ===");
const m = { nickname: "Kaio", user: { username: "kaio" } };
console.log("  nick inicial:", m.nickname, "=> controle lido:", pun.lerControle(m));
m.nickname = "Kaio 60%";
console.log("  nick com 60%:", m.nickname, "=> controle lido:", pun.lerControle(m));

const d = am.carregar();
delete d.servidores[G];
delete d.pendentes[G];
am.persistir();
