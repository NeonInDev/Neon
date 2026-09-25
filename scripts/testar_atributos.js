// Rebaixamento de atributo: tem que TIRAR o cargo velho e BOTAR o novo.
// Antes o codigo juntava os dois num array so e o remove() apagava os dois,
// deixando a pessoa sem cargo de atributo nenhum.
const p = require("../src/punicoes");
const { ATRIBUTOS, ORDEM_RANK } = p;

// nome -> id do cargo, pra montar e conferir o cache
const catF = Object.keys(ATRIBUTOS).find((c) => /for/i.test(c));
const catV = Object.keys(ATRIBUTOS).find((c) => /vigor/i.test(c));
const catZ = Object.keys(ATRIBUTOS).find((c) => /for/i.test(c)); // so tem ate S
const catA = Object.keys(ATRIBUTOS).find((c) => /agil/i.test(c)); // so tem ate S
const catR = Object.keys(ATRIBUTOS).find((c) => /resist/i.test(c)); // vai ate Z

function membroCom(ranks) {
  // ranks: { categoria: "Rank X" }
  const ids = [];
  for (const [cat, rank] of Object.entries(ranks)) ids.push(ATRIBUTOS[cat].ranks[rank]);
  const cache = [...ids];
  cache.has = (id) => cache.includes(id);
  cache.get = (id) => (cache.includes(id) ? { id } : null);
  cache.find = (fn) => (cache.find((x) => fn({ id: x })) ? { id: cache.find((x) => fn({ id: x })) } : undefined);

  const state = { tem: new Set(ids) };
  return {
    cargos: state,
    roles: {
      cache,
      add: async (lista, motivo) => {
        for (const id of [].concat(lista)) state.tem.add(String(id));
        state.add = motivo;
      },
      remove: async (lista, motivo) => {
        for (const id of [].concat(lista)) state.tem.delete(String(id));
        state.remove = motivo;
      },
    },
    temRank(cat, rank) {
      return state.tem.has(ATRIBUTOS[cat].ranks[rank]);
    },
  };
}

let falhas = 0;
function ok(cond, msg) {
  console.log(`${cond ? "OK   " : "FALHA"} ${msg}`);
  if (!cond) falhas++;
}

(async () => {
  console.log("=== -1 ranque (5º aviso) ===");
  let m = membroCom({ [catF]: "A", [catV]: "B", [catR]: "S" });
  let r = await p.aplicarAtributos(m, { ranques: 1 });
  ok(r.ok, `aplicou sem erro (${r.motivo || "ok"})`);
  ok(m.temRank(catF, "B"), `${catF}: A virou B`);
  ok(!m.temRank(catF, "A"), `${catF}: cargo A foi removido`);
  ok(m.temRank(catV, "C"), `${catV}: B virou C`);
  ok(!m.temRank(catV, "B"), `${catV}: cargo B foi removido`);
  ok(m.temRank(catR, "A"), `${catR}: S virou A`);
  ok(!m.temRank(catR, "S"), `${catR}: cargo S foi removido`);
  ok(m.cargos.tem.size === 3, `continua com 3 cargos de atributo (tem ${m.cargos.tem.size})`);

  console.log("\n=== -2 ranques (6º aviso) ===");
  m = membroCom({ [catF]: "S" });
  r = await p.aplicarAtributos(m, { ranques: 2 });
  ok(m.temRank(catF, "B"), `${catF}: S virou B (dois lances na escada F-E-D-C-B-A-S)`);
  ok(!m.temRank(catF, "S"), `${catF}: cargo S foi removido`);

  console.log("\n=== -3 ranques (7º aviso) ===");
  m = membroCom({ [catF]: "Z" });
  r = await p.aplicarAtributos(m, { ranques: 3 });
  ok(m.temRank(catF, "A"), `${catF}: Z virou A`);

  console.log("\n=== teto B (8º aviso) ===");
  m = membroCom({ [catF]: "Z", [catV]: "A" });
  r = await p.aplicarAtributos(m, { ranques: 0, tetoRank: "B" });
  ok(m.temRank(catF, "B"), `${catF}: Z foi limitado a B`);
  ok(m.temRank(catV, "B"), `${catV}: A foi limitado a B`);
  ok(m.cargos.tem.size === 2, `2 categorias, 2 cargos (tem ${m.cargos.tem.size})`);

  console.log("\n=== teto C (9º aviso) ===");
  m = membroCom({ [catF]: "Z", [catR]: "SS" });
  r = await p.aplicarAtributos(m, { ranques: 0, tetoRank: "C" });
  ok(m.temRank(catF, "C") && m.temRank(catR, "C"), "os dois foram limitados a C");

  console.log("\n=== Vigor e Agilidade param no S, nao tem Z ===");
  ok(!ATRIBUTOS[catV].ranks.Z && !ATRIBUTOS[catA].ranks.Z, "Vigor e Agilidade realmente nao tem o cargo Z");
  m = membroCom({ [catV]: "S", [catA]: "S" });
  r = await p.aplicarAtributos(m, { ranques: 1, tetoRank: "C" });
  ok(m.temRank(catV, "C") && m.temRank(catA, "C"), "o teto C ganha do -1 ranque: S virou C nas duas");

  console.log("\n=== quem ja esta abaixo do teto nao mexe ===");
  m = membroCom({ [catF]: "C" });
  r = await p.aplicarAtributos(m, { ranques: 0, tetoRank: "B" });
  ok(m.temRank(catF, "C") && m.cargos.tem.size === 1, "C continua C, e o cargo continua no lugar");

  console.log("\n=== no F nao tem pra descer ===");
  m = membroCom({ [catF]: "F" });
  r = await p.aplicarAtributos(m, { ranques: 5 });
  ok(m.temRank(catF, "F") && m.cargos.tem.size === 1, "F continua F, sem perder o cargo");

  console.log("\n=== sem cargo de atributo nao faz nada ===");
  m = membroCom({});
  r = await p.aplicarAtributos(m, { ranques: 2 });
  ok(r.ok && r.resumo.length === 0, "nada a mudar, sem erro");

  console.log(`\n${falhas ? `FALHOU: ${falhas}` : "TUDO OK"}`);
  process.exit(falhas ? 1 : 0);
})();
