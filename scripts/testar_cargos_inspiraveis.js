// =============================================================
// CARGOS INSPIRAVEIS
// -------------------------------------------------------------
// Cada cargo tem um canal onde pode ser marcado, e as vezes um
// intervalo. Quebrar qualquer uma das regras da um "warn inspiravel".
// =============================================================
const am = require("../src/automod");
const { nivelInspiravel } = require("../src/punicoes");

const G = "999999999999999999";
const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;

const CARGOS = {
  instagram: "1498218757233967125",
  twitter: "1498218739319963738",
  acontecimentos: "1498218702863204392",
  trocas: "1498218554120605827",
  chamar: "1498218513809276998",
};
const CANAIS = {
  redes: "1498404746053029999",
  acontecimentos: "1498172516055912530",
  trocas: "1498206618406621184",
  chamar: "1498207785098416178",
  fora: "111111111111111111",
};

function cacheFalso(itens) {
  const arr = [...itens];
  arr.get = (id) => arr.find((x) => x.id === id) || null;
  arr.has = (id) => arr.some((x) => x.id === id);
  arr.find = (fn) => arr.find(fn);
  return arr;
}

function guildFalso() {
  const canalPorId = (id) => (id ? { id, isTextBased: () => true, send: async () => {}, name: `canal-${id.slice(0, 4)}` } : null);
  const g = {
    id: G,
    name: "teste",
    ownerId: "dono",
    client: { user: { id: "neon" } },
    channels: { cache: cacheFalso(Object.values(CANAIS).map(canalPorId)) },
    members: { cache: cacheFalso([]) },
    roles: { cache: cacheFalso([]) },
  };
  g.channels.cache.get = (id) => canalPorId(id) || null;
  return g;
}

function mensagem(guild, texto, cargoIds, userId) {
  return {
    guild,
    content: texto,
    author: { id: userId, tag: `${userId}#0001`, username: userId, bot: false },
    member: {
      id: userId, nickname: userId, guild, moderatable: true, manageable: true,
      roles: cacheFalso([]), permissions: { has: () => false },
      user: { id: userId, tag: `${userId}#0001`, bot: false, send: async () => {} },
      timeout: async () => {}, setNickname: async () => {},
    },
    channel: guild.channels.cache.get(texto.__canal) || null,
    mentions: { users: new Map(), roles: cacheFalso((cargoIds || []).map((id) => ({ id }))) },
    delete: async () => true,
  };
}

let falhas = 0;
function ok(cond, msg) {
  console.log(`${cond ? "OK   " : "FALHA"} ${msg}`);
  if (!cond) falhas++;
}

function msgEm(guild, texto, cargoId, userId, canal) {
  const m = mensagem(guild, texto, cargoId ? [cargoId] : [], userId);
  m.channel = guild.channels.cache.get(canal);
  return m;
}

function marcar(guild, texto, cargoId, userId, canal) {
  const m = msgEm(guild, texto, cargoId, userId, canal);
  const r = am.checarCargosInspiraveis(m);
  return r;
}

(async () => {
  const guild = guildFalso();
  am.configGuild(G);
  am.persistir();

  console.log("=== cargo 1 e 2 (Instagram/Twitter): so em #redes-sociais, sem intervalo ===");
  ok(!marcar(guild, "bora", CARGOS.instagram, "u1", CANAIS.redes), "marcacao certa NAO gera warn");
  ok(marcar(guild, "bora", CARGOS.instagram, "u1", CANAIS.fora), "fora do canal -> warn");
  ok(marcar(guild, "bora", CARGOS.twitter, "u2", CANAIS.acontecimentos), "Twitter em channel errado -> warn");
  // sem intervalo, pode repetir no canal certo
  for (let i = 0; i < 5; i++) ok(!marcar(guild, "de novo", CARGOS.instagram, "u1", CANAIS.redes), `repetida ${i + 1} no canal certo, sem intervalo -> liberado`);

  console.log("\n=== cargo 3 (Acontecimentos): so no canal, intervalo PESSOAL de 10min ===");
  ok(!marcar(guild, "chamando", CARGOS.acontecimentos, "u3", CANAIS.acontecimentos), "primeira vez -> liberado");
  ok(marcar(guild, "de novo", CARGOS.acontecimentos, "u3", CANAIS.acontecimentos), "mesma pessoa em menos de 10min -> warn");
  ok(!marcar(guild, "outra pessoa", CARGOS.acontecimentos, "u9", CANAIS.acontecimentos), "OUTRA pessoa pode no mesmo intervalo (pessoal e pessoal)");
  ok(marcar(guild, "x", CARGOS.acontecimentos, "u3", CANAIS.fora), "fora do canal -> warn");

  console.log("\n=== cargo 4 (Trocas): global 10min + pessoal 2h ===");
  ok(!marcar(guild, "vendo", CARGOS.trocas, "t1", CANAIS.trocas), "primeira vez -> liberado");
  ok(marcar(guild, "eu de novo", CARGOS.trocas, "t1", CANAIS.trocas), "a MESMA pessoa em menos de 2h -> warn");
  ok(marcar(guild, "cicrano", CARGOS.trocas, "t2", CANAIS.trocas), "OUTRA pessoa em menos de 10min (global) -> warn");

  console.log("\n=== cargo 5 (Chamar RP): global 10min, SEM pessoal ===");
  ok(!marcar(guild, "vem rp", CARGOS.chamar, "c1", CANAIS.chamar), "primeira vez -> liberado");
  ok(marcar(guild, "outro", CARGOS.chamar, "c2", CANAIS.chamar), "outra pessoa em menos de 10min (global) -> warn");
  ok(marcar(guild, "x", CARGOS.chamar, "c1", CANAIS.fora), "fora do canal -> warn");

  console.log("\n=== dois cargos quebrados na mesma mensagem contam separado ===");
  const m2 = msgEm(guild, " Instagram Twitter Acontecimentos Trocas Chamar ", null, "multi", CANAIS.fora);
  m2.mentions.roles = cacheFalso(Object.values(CARGOS).map((id) => ({ id })));
  const r2 = am.checarCargosInspiraveis(m2);
  ok(r2 && r2.quebras.length === 5, `5 quebras numa mensagem so (veio ${r2?.quebras?.length})`);

  console.log("\n=== sem marcacao nao acontece nada ===");
  ok(!marcar(guild, "oi pessoal", null, "u5", CANAIS.fora), "mensagem comum -> sem warn");
  ok(!marcar(guild, "oi", null, "u5", CANAIS.redes), "mencionar so usuario -> sem warn");

  console.log("\n=== warn inspiravel: leve, some em 1 mes, nunca bane ===");
  const n1 = nivelInspiravel(1);
  ok(!n1.acao, "1 warn inspiravel nao tem acao de ban/kick");
  const n5 = nivelInspiravel(5);
  ok(n5.minutos === 360, `5 warns -> 6h (metade de 12h), veio ${n5.minutos / 60}h`);
  const n7 = nivelInspiravel(7);
  ok(n7.minutos === 1440, `7 warns -> 24h (metade de 48h), veio ${n7.minutos / 60}h`);
  const n9 = nivelInspiravel(9);
  ok(n9.minutos === 5040, `9 warns -> 3.5 dias (metade de 7d), veio ${n9.minutos / 60}h`);
  ok(!n9.acao, "9 warns inspiraveis nao banem (o normal ban no 10)");
  ok(nivelInspiravel(20).minutos === 5040, `20 warns -> trava no 9 (3.5 dias), veio ${nivelInspiravel(20).minutos / 60}h`);
  ok(!nivelInspiravel(50).acao && nivelInspiravel(50).minutos > 0, "nem 50 warns inspiraveis expulsam, e ainda tem mute");

  console.log("\n=== expiracao de 1 mes ===");
  am.limpar();
  am.configGuild(G);
  am.persistir();
  const d = am.carregar();
  const agora = Date.now();
  d.warnsInspiraveis = {
    [`${G}:u1`]: { guildId: G, userId: "u1", datas: [agora - 5 * DIA, agora - 40 * DIA, agora - 31 * DIA, agora - 1000] },
  };
  const r3 = am.limparInspiraveisVencidos(G, "u1");
  ok(r3.ativas === 2, `so as 2 de menos de 1 mes contam (veio ${r3.ativas})`);
  ok(r3.apagadas === 2, `as 2 velhas sumiram (veio ${r3.apagadas})`);

  // e o contador so zera o que venceu, nao tudo
  d.warnsInspiraveis[`${G}:u1`].datas = [agora - 40 * DIA, agora - 1000];
  const r4 = am.limparInspiraveisVencidos(G, "u1");
  ok(r4.ativas === 1 && r4.apagadas === 1, "a infracao nova continua valendo depois de limpar a velha");

  console.log("\n=== staff e dono nao sao presos na regra ===");
  const g2 = guildFalso();
  const mStaff = msgEm(g2, "teste", CARGOS.instagram, "staff1", CANAIS.fora);
  mStaff.member.permissions.has = (p) => p === 8n; // KickMembers/admin
  am.persistir();
  const achou = await am.aplicarCargosInspiraveis(mStaff);
  ok(achou === null, "staff com permissao -> nao recebe warn inspiravel");

  const mDono = msgEm(g2, "teste", CARGOS.instagram, "dono", CANAIS.fora);
  g2.ownerId = "dono";
  mDono.member.permissions.has = () => false;
  const achouDono = await am.aplicarCargosInspiraveis(mDono);
  ok(achouDono === null, "o dono -> nao recebe warn inspiravel");

  const dt = am.carregar();
  delete dt.servidores[G];
  delete dt.pendentes?.[G];
  delete dt.warnsInspiraveis;
  delete dt.marcacoesCargo;
  am.persistir();
  am.limpar();
  console.log(`\n${falhas ? `FALHOU: ${falhas}` : "TUDO OK"}`);
  process.exit(falhas ? 1 : 0);
})();
