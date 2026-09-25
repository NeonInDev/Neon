// O warn inspiravel tem que gerar MUTE de verdade, e nao banir/kickar.
const am = require("../src/automod");

const G = "999999999999999999";
const CARGO = "1498218757233967125";
const CANAL_CERTO = "1498404746053029999";
const CANAL_ERRADO = "111111111111111111";

function cacheFalso(itens) {
  const arr = [...itens];
  const findOriginal = arr.find.bind(arr);
  arr.get = (id) => arr.find((x) => x.id === id) || null;
  arr.has = (id) => arr.some((x) => x.id === id);
  arr.find = (fn) => findOriginal(fn);
  return arr;
}

const silenciados = [];
const nicks = [];
const dms = [];
const kicks = [];
const bans = [];

function guildFalso() {
  const canal = (id) => (id ? { id, isTextBased: () => true, name: "c", send: async () => {} } : null);
  const g = {
    id: G, name: "teste", ownerId: "dono", client: { user: { id: "neon" } },
    channels: { cache: cacheFalso([canal(CANAL_CERTO), canal(CANAL_ERRADO)]) },
    members: { cache: cacheFalso([]) },
    roles: { cache: cacheFalso([]) },
  };
  g.channels.cache.get = (id) => canal(id) || null;
  return g;
}

let falhas = 0;
function ok(cond, msg) {
  console.log(`${cond ? "OK   " : "FALHA"} ${msg}`);
  if (!cond) falhas++;
}

(async () => {
  const guild = guildFalso();
  am.configGuild(G);
  am.persistir();
  // limpa restos de execucoes anteriores que quebraram no meio
  const d0 = am.carregar();
  delete d0.warnsInspiraveis;
  delete d0.marcacoesCargo;
  am.persistir();
  am.limpar();

  const member = {
    id: "u1", nickname: "Fulano 100%", guild, moderatable: true, manageable: true,
    roles: cacheFalso([]), permissions: { has: () => false },
    user: { id: "u1", tag: "Fulano#0001", bot: false, send: async (t) => dms.push(t) },
    timeout: async (ms, motivo) => silenciados.push({ ms, motivo }),
    setNickname: async (n) => {
      nicks.push(n);
      member.nickname = n;
    },
  };
  const m = {
    guild, content: " Instagram ", author: { id: "u1", tag: "Fulano#0001", bot: false },
    member, channel: guild.channels.cache.get(CANAL_ERRADO),
    mentions: { users: new Map(), roles: cacheFalso([{ id: CARGO }]) },
    delete: async () => true,
  };

  const r = await am.aplicarCargosInspiraveis(m);
  ok(!!r, "a marcação fora do canal devolveu warn inspirável");
  ok(r?.warn === 1, `contador em ${r?.warn}`);
  ok(silenciados.length === 1, `foi silenciado ${silenciados.length}x`);
  const min = silenciados[0] ? Math.round(silenciados[0].ms / 60000) : 0;
  ok(min === 30, `1º warn inspirável: mute de ${min} min (piso de 30 min, bem leve)`);
  ok(nicks.length === 0, "1º e 2º não mexem no controle (o teto deles é 100%, já está em 100%)");
  ok(kicks.length === 0 && bans.length === 0, "não expulsou nem baniu");

  // segundo warn: 2 warns inspiraveis -> metade das 4h = 2h... nao, metade das 2h = 1h
  silenciados.length = 0;
  const m2 = { ...m, content: " Instagram de novo " };
  const r2 = await am.aplicarCargosInspiraveis(m2);
  ok(r2?.warn === 2, `contador em ${r2?.warn}`);
  const min2 = silenciados[0] ? Math.round(silenciados[0].ms / 60000) : 0;
  ok(min2 === 60, `2º warn: mute de ${min2} min (metade das 2h)`);

  // 4o inspiravel: o 4o nivel normal tem teto de 90%, entao o nick desce
  silenciados.length = 0;
  for (let i = 0; i < 2; i++) await am.aplicarCargosInspiraveis({ ...m, content: " Instagram " });
  const r4 = am.contarInspiraveis(G, "u1");
  ok(r4.ativas === 4, `contador em ${r4.ativas}`);
  const min4real = silenciados.length ? Math.round(silenciados[silenciados.length - 1].ms / 60000) : 0;
  ok(min4real === 240, `4º warn: mute de ${min4real} min (metade das 8h)`);
  ok(member.nickname === "Fulano 95%", `controle desceu só até a metade do caminho (100% -> teto 90%): ${member.nickname}`);

  console.log(`\nDM recebida pelo usuário:`);
  console.log(`  ${String(dms[0] || "(nenhuma)").split("\n").slice(0, 3).join(" / ")}`);

  const dt = am.carregar();
  delete dt.servidores[G];
  delete dt.warnsInspiraveis;
  delete dt.marcacoesCargo;
  am.persistir();
  am.limpar();
  console.log(`\n${falhas ? `FALHOU: ${falhas}` : "TUDO OK"}`);
  process.exit(falhas ? 1 : 0);
})();
