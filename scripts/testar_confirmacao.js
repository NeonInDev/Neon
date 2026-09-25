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

  console.log("=== 1. 1 a 9 warns NAO goes para a fila (so mute) ===");
  let r;
  let filaTarde = 0;
  for (let i = 1; i <= 9; i++) {
    r = await am.darWarn(guild, { id: "alvo1", tag: "Alvo#0001" }, `teste ${i}`, null, { automatico: true, tipo: "filtro" });
    const p = am.pendente(G, "alvo1");
    if (p) filaTarde++;
    console.log(
      `  ${String(r.warn).padStart(2)}º aviso -> ${r.punicao ? `${r.punicao.warns}º nível` : "sem nível"}` +
        ` | ${r.punicao?.minutos ? `${Math.round(r.punicao.minutos / 60)}h de mute` : "sem mute"}` +
        ` | na fila: ${!!p}`,
    );
  }
  console.log(`niveis que viraram pedido de confirmacao: ${filaTarde} <- esperado 0`);

  console.log("\n=== 2. 10 warns => BAN, e para o dono ===");
  r = await am.darWarn(guild, { id: "alvo1", tag: "Alvo#0001" }, "teste 10", null, { automatico: true, tipo: "filtro" });
  console.log("regra aplicada:", JSON.stringify(r.punicao));
  const p = am.pendente(G, "alvo1");
  console.log("pedido criado?   ", !!p, p ? `-> ${p.acao.toUpperCase()} + mute de ${p.minutosMute / 1440} dias` : "");
  console.log("ban executado?   ", banned.includes("alvo1"), "<- esperado false (nao bane sozinho)");
  console.log("log com botoes?  ", logsEnviados.some((m) => m.components?.[0]?.components?.length === 2), "<- esperado true");

  console.log("\n=== 3. usuario COMUM tenta confirmar ===");
  const r2 = await am.decidirPuncao(guild, "alvo1", true, { id: COMUM, tag: "Ze#0002" });
  console.log("resposta:", r2.ok ? "PERMITIU (BUG!)" : r2.erro);
  console.log("ban executado?   ", banned.includes("alvo1"), "<- esperado false");

  console.log("\n=== 4. ADMIN CONFIRMA ===");
  const r4 = await am.decidirPuncao(guild, "alvo1", true, { id: OWNER, tag: "Dono#0001" });
  console.log("resposta:", r4.texto);
  console.log("ban executado?   ", banned.includes("alvo1"), "<- esperado true");

  console.log("\n=== 5. ADMIN RECUSA (pedido novo) ===");
  const d = am.carregar();
  d.pendentes[G]["alvo1"] = { userId: "alvo1", userTag: "Alvo#0001", acao: "ban", motivo: "spam massivo", apagarDias: 1, pedidoEm: Date.now() };
  am.persistir();
  const r3 = await am.decidirPuncao(guild, "alvo1", false, { id: OWNER, tag: "Dono#0001" });
  console.log("resposta:", r3.texto);
  console.log("pedido removido? ", am.pendente(G, "alvo1") === null, "<- esperado true");
  console.log("ban executado?   ", banned.length, "<- esperado 1 (o unico foi o da secao 4)");

  console.log("\n=== 6. KICK no fluxo antigo tambem vira fila e espera ===");
  const d4 = am.carregar();
  d4.pendentes[G]["alvo1"] = { userId: "alvo1", userTag: "Alvo#0001", acao: "kick", motivo: "teste", pedidoEm: Date.now() };
  am.persistir();
  const r5 = await am.decidirPuncao(guild, "alvo1", true, { id: OWNER, tag: "Dono#0001" });
  console.log("resposta:", r5.texto);
  console.log("kick executado?  ", kiced.includes("alvo1"), "<- esperado true");

  console.log("\n=== 7. timeout NAO vai pra fila ===");
  const d2 = am.carregar();
  d2.pendentes[G] = {};
  am.persistir();
  const r6 = await am.aplicarPunicao(guild, mkMember(false), { acao: "timeout", minutos: 1440 }, "mute curto");
  console.log("retorno:", JSON.stringify(r6));
  console.log("na fila:         ", am.listarPendentes(G).length, "<- esperado 0");

  const d3 = am.carregar();
  delete d3.servidores[G];
  delete d3.pendentes[G];
  am.persistir();
  am.limparWarns(G, "alvo1", true);
  console.log("\nconfig de teste removida.");
})();
