// Confere a lista exata que o dono pediu: o que tem que cair, cai; o que
// tem que passar, passa.
const am = require("../src/automod");
const G = "999999999999999999";

function cacheFalso(itens) {
  const arr = [...itens];
  arr.get = (id) => arr.find((x) => x.id === id) || null;
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

let apagadas = 0;
let avisados = 0;

function pega(t) {
  const m = {
    guild, content: t,
    author: { id: "u", username: "u", tag: "u#0001", globalName: null, bot: false },
    member: {
      id: "u", nickname: "u", guild, moderatable: true, manageable: true,
      roles: cacheFalso([]), permissions: { has: () => false },
      user: { id: "u", tag: "u#0001", bot: false, send: async () => {} },
      timeout: async () => {}, setNickname: async () => {},
      send: async () => {},
    },
    channel: { id: "c", name: "chat", send: async () => { avisados++; } },
    mentions: { users: new Map(), roles: new Map() },
    delete: async () => { apagadas++; return true; },
  };
  am.aplicarNoMembro(m, m.member);
  const v = am.checarMensagem(m);
  if (v && v.tipo === "palavraProibida") am.aplicarFiltro(v);
  return v && v.tipo === "palavraProibida" ? { palavra: v.palavra, apagada: apagadas > 0 } : null;
}

const DEVEM_CAIR = [
  "voce e estuprado",
  "esse cara ta estuprando",
  "para de estuprar a tv",
  "para de me molestar",
  "fiquei molestado com isso",
  "sou abusado nessa historia",
  "que absd mano",
  "strpd demais",
  "mcc nao credo",
  "seu macaco",
  "que ESTUPRADO kkkk",
  "tá estúprado hein",
  "MACACO sujo",
];
const DEVEM_PASSAR = [
  "bom dia pessoal",
  "estou comestudo a mao",
  "voce ficou estudioso hoje",
  "meu gato preto dormiu o dia todo",
  "a fruta e boa",
  "alguem sabe de macacos? to zoando",
  "aquele filme preto e branco",
  "estouvestindo roupa preta",
  "que horas sao",
];

let falhas = 0;
console.log("=== tem que BARRAR (apagado) ===");
for (const t of DEVEM_CAIR) {
  apagadas = 0; avisados = 0;
  const r = pega(t);
  const ok = !!r && r.apagada;
  if (!ok) falhas++;
  console.log(`  ${ok ? "OK  " : "FALHOU"} "${t}"${r ? ` -> ${r.palavra} | apagada=${r.apagada}` : " -> nao disparou"}`);
}
console.log("\n=== tem que PASSAR (mantida, sem warn) ===");
for (const t of DEVEM_PASSAR) {
  apagadas = 0; avisados = 0;
  const r = pega(t);
  const ok = !r || !r.apagada;
  if (!ok) falhas++;
  const detalhe = r ? `casou com "${r.palavra}" e ${r.apagada ? "APAGOU" : "foi liberada"}` : "nao disparou";
  console.log(`  ${ok ? "OK  " : "FALHOU"} "${t}" -> ${detalhe}`);
}

const d = am.carregar();
delete d.servidores[G];
delete d.pendentes[G];
am.persistir();
console.log(`\n${falhas === 0 ? "TUDO OK" : falhas + " FALHAS"}`);
