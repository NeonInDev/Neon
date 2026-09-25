// Valida os dois pedidos do dono:
//  1) "eu gosto de usar roupa preta" -> sem warn, sem apagar
//  2) caps lock -> so lembrete no chat, sem apagar e sem warn
const am = require("../src/automod");
const G = "999999999999999999";
const PARCERIAS = "1498178365923000390";

const logsEnviados = [];
const avisados = [];
let apagadas = 0;
let warns = 0;

const canalLogFalso = {
  id: "logchan", name: "staff", isTextBased: () => true,
  send: async (m) => (logsEnviados.push(m), m),
};
function cacheFalso(itens) {
  const arr = [...itens];
  arr.get = (id) => arr.find((x) => x.id === id) || null;
  return arr;
}

const guild = {
  id: G, name: "teste", ownerId: "773354042805694954", client: { user: { id: "b" } },
  members: {
    cache: cacheFalso([]),
    fetch: async () => null,
    ban: async () => {},
  },
  channels: { cache: cacheFalso([canalLogFalso]) },
};
am.setCanalLog(G, "logchan");
const cfg = am.configGuild(G);
cfg.enabled = true;
cfg.filtros.ativo = true;
cfg.filtros.contextoIa = false; // testa so o atalho local
cfg.filtros.caps = true;
cfg.filtros.palavras = ["preto", "negro", "idiota", "merda", "macaco"];
am.persistir();
am.limparWarns(G, "u1", true);

function mk(texto, canalId = "chatGERAL") {
  const ch = {
    id: canalId, name: canalId === PARCERIAS ? "parcerias" : "chat-geral",
    send: async (m) => (avisados.push(m), m),
  };
  return {
    guild, content: texto,
    author: { id: "u1", username: "u1", globalName: null, bot: false },
    member: { id: "u1", roles: cacheFalso([]), permissions: { has: () => false }, user: { bot: false }, moderatable: true, guild },
    channel: ch,
    mentions: { users: new Map(), roles: new Map() },
    delete: async () => { apagadas++; return true; },
  };
}

(async () => {
  const casos = [
    "eu gosto de usar roupa preta",
    "meu cabelo preto ficou lindo depois do corte",
    "comprei um vestido preto na loja",
    "aquele filme preto e branco é clássico",
    "minha pele escura não é problema",
    "a ficha do personagem: cabelo preto, eyesAzuis",
  ];
  console.log("=== 1. frases legitimas com palavra filtrada ===");
  for (const t of casos) {
    const m = mk(t);
    const v = am.checarMensagem(m);
    if (v) {
      await am.aplicarFiltro(v);
      const w = am.contarWarns(G, "u1");
      console.log(`  ${t}\n     -> ${v.tipo} "${v.palavra}" | apagadas=${apagadas} warns=${w.ativo}`);
    } else {
      console.log(`  ${t}\n     -> nao disparou nada`);
    }
  }
  console.log(`\n  total apagadas: ${apagadas}  <- esperado 0`);
  console.log(`  total warns:    ${am.contarWarns(G, "u1").ativo}  <- esperado 0`);

  console.log("\n=== 2. caps lock: so lembrete ===");
  apagadas = 0; avisados.length = 0;
  const mCaps = mk("ESTOU GRITANDO COM VOCES AGORA MESMO");
  const vCaps = am.checarMensagem(mCaps);
  console.log("  filtro:", vCaps ? vCaps.tipo + "/" + vCaps.acao : "nenhum");
  await am.aplicarFiltro(vCaps);
  console.log("  apagadas:      ", apagadas, "<- esperado 0");
  console.log("  lembrete no chat:", avisados.length, "<- esperado 1");
  console.log("  aviso enviado: ", avisados[0]?.content?.slice(0, 70));
  console.log("  warns:         ", am.contarWarns(G, "u1").ativo, "<- esperado 0");

  console.log("\n=== 3. caps NAO pode mascarar xingamento ===");
  apagadas = 0; avisados.length = 0;
  const mOfensa = mk("VOCES SAO TUDO IDIOTA E MERDA NESSA CASA");
  const vOf = am.checarMensagem(mOfensa);
  console.log("  filtro:", vOf ? vOf.tipo : "nenhum (so caps, que so avisa)");
  console.log("  -> caps nunca apaga: o filtro mais pesado (palavra) roda antes");

  const d = am.carregar();
  delete d.servidores[G];
  delete d.pendentes[G];
  am.persistir();
  am.limparWarns(G, "u1", true);
  console.log("\nconfig de teste removida.");
})();
