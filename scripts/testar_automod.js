const am = require("../src/automod");
const G = "1498162375251988624";
const cfg = am.configGuild(G);
cfg.enabled = true;
cfg.filtros.ativo = true;
am.persistir();

const guild = {
  id: G,
  name: "teste",
  ownerId: "owner",
  client: { user: { id: "bot" } },
  members: { fetch: async () => null },
  channels: { cache: new Map() },
};

let seq = 0;
function mk(content, user = "u1") {
  return {
    guild,
    content,
    author: { id: user, username: "alguem", globalName: null, bot: false, tag: "a#1" },
    member: {
      id: user,
      roles: { cache: { some: () => false } },
      permissions: { has: () => false },
      user: { bot: false },
    },
    // canal unico por mensagem: o contador de flood nao pode disparar aqui
    channel: { id: "c" + seq++, name: "geral" },
    mentions: { users: new Map(), roles: new Map() },
    delete: async () => true,
  };
}

const ofensas = [
  "negro",
  "pele escura",
  "estuprado",
  "vou estuprar voce",
  "ele ta estuprando a mina",
  "para de molestar",
  "to molestado",
  "fui abusado",
  "preto",
  "negão",
  "lixo",
  "absd",
  "strpd",
  "mcc",
  "macaco",
  "ESTÚPRADO",
  "EstupRando",
  "NEGÃO",
  "e o mlk AbSd",
];

const limpos = [
  "oi pessoal",
  "bom dia",
  "vamos jogar",
  "a prova de macaco é linda",
  "nao gostei",
  "que dia lindo",
  "se inscreve no meu canal https://youtube.com/x",
  "ontem eu vi um gato",
  "amanha tem prova?",
];

let acertos = 0;
let falsos = 0;

console.log("=== DEVEM SER BLOQUEADOS ===");
for (const t of ofensas) {
  const v = am.checarMensagem(mk(t));
  if (v) acertos += 1;
  console.log((v ? "OK  " : "FALHOU ") + t + (v ? "  -> " + v.tipo + ' ("' + v.palavra + '")' : "  -> NAO BLOQUEADO"));
}

console.log("\n=== NAO DEVEM BLOQUEAR PALAVRAS NORMAIS ===");
for (const t of limpos) {
  const v = am.checarMensagem(mk(t));
  if (v) falsos += 1;
  console.log((v ? "FALSO POSITIVO " : "OK   ") + t + (v ? "  -> " + v.tipo : "  -> limpo"));
}

console.log(`\nRESULTADO: ${acertos}/${ofensas.length} ofensas barradas, ${falsos} falsos positivos em ${limpos.length} frases limpas.`);
