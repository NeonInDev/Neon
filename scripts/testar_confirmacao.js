// Usa um guild ficticio e limpa tudo no fim: nao encosta na config real.
const am = require("../src/automod");
const G = "999999999999999999";
const OWNER = "773354042805694954";
const COMUM = "111111111111111111";

const banned = [];
const kiced = [];
const logsEnviados = [];

const canalLogFalso = { id: "logchan", name: "staff", isTextBased: () => true, send: async (m) => (logsEnviados.push(m), m) };

function cacheFalso(itens) {
  const arr = [...itens];
  arr.get = (id) => arr.find((x) => x.id === id) || null;
  return arr;
}

let guild;

function mkMember(permAdmin) {
  return {
    id: "alvo1",
    user: { id: "alvo1", tag: "Alvo#0001", bot: false, send: async () => {} },
    roles: { cache: cacheFalso([]) },
    permissions: { has: () => permAdmin },
    isCommunicationDisabled: () => false,
    moderatable: true,
    guild,
    timeout: async () => {},
    kick: async () => kiced.push("alvo1"),
  };
}

(async () => {
  guild = {
    id: G,
    name: "teste",
    ownerId: OWNER,
    client: { user: { id: "b" } },
    members: { cache: cacheFalso([]), fetch: async (id) => mkMember(id !== "alvo1"), ban: async (id) => banned.push(id) },
    channels: { cache: cacheFalso([canalLogFalso]) },
  };
  am.setCanalLog(G, "logchan");
  const cfg = am.configGuild(G);
  cfg.confirmarPunicao = true;
  am.persistir();
  am.limparWarns(G, "alvo1", true); // zera warns de execucoes anteriores

  console.log("=== 1. 4 warns => escala pede KICK ===");
  let r;
  for (let i = 1; i <= 4; i++) r = await am.darWarn(guild, { id: "alvo1", tag: "Alvo#0001" }, `teste ${i}`, null, { automatico: true, tipo: "filtro" });
  console.log("regra aplicada:", JSON.stringify(r.punicao));
  const p = am.pendente(G, "alvo1");
  console.log("pedido criado?   ", !!p, p ? `-> ${p.acao.toUpperCase()} + mute de ${p.minutosMute / 1440} dias` : "");
  console.log("kick executado?  ", kiced.length > 0, "<- esperado false (nao expulsa sozinha)");
  console.log("log com botoes?  ", logsEnviados.some((m) => m.components?.[0]?.components?.length === 2), "<- esperado true");

  console.log("\n=== 2. usuario COMUM tenta confirmar ===");
  const r2 = await am.decidirPuncao(guild, "alvo1", true, { id: COMUM, tag: "Ze#0002" });
  console.log("resposta:", r2.ok ? "PERMITIU (BUG!)" : r2.erro);
  console.log("kick executado?  ", kiced.length > 0, "<- esperado false");

  console.log("\n=== 3. ADMIN RECUSA ===");
  const r3 = await am.decidirPuncao(guild, "alvo1", false, { id: OWNER, tag: "Dono#0001" });
  console.log("resposta:", r3.texto);
  console.log("pedido removido? ", am.pendente(G, "alvo1") === null, "<- esperado true");

  console.log("\n=== 4. ADMIN CONFIRMACAO de BAN ===");
  const d = am.carregar();
  d.pendentes[G]["alvo1"] = { userId: "alvo1", userTag: "Alvo#0001", acao: "ban", motivo: "spam massivo", apagarDias: 1, pedidoEm: Date.now() };
  am.persistir();
  const r4 = await am.decidirPuncao(guild, "alvo1", true, { id: OWNER, tag: "Dono#0001" });
  console.log("resposta:", r4.texto);
  console.log("ban executado?   ", banned.includes("alvo1"), "<- esperado true");

  console.log("\n=== 5. timeout NAO vai pra fila ===");
  const d2 = am.carregar();
  d2.pendentes[G] = {};
  am.persistir();
  const r5 = await am.aplicarPunicao(guild, mkMember(false), { acao: "timeout", minutos: 1440 }, "mute curto");
  console.log("retorno:", JSON.stringify(r5));
  console.log("na fila:         ", am.listarPendentes(G).length, "<- esperado 0");

  const d3 = am.carregar();
  delete d3.servidores[G];
  delete d3.pendentes[G];
  am.persistir();
  am.limparWarns(G, "alvo1", true);
  console.log("\nconfig de teste removida.");
})();
