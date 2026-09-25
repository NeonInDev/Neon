const { avaliarContexto } = require("../src/contexto_ia");

const LEGITIMOS = [
  { texto: "o cabelo preto dele e bonito", termo: "preto", canal: "chat-geral" },
  { texto: "ela tem os olhos negros", termo: "negro", canal: "chat-geral" },
  { texto: "a prova de macaco e linda", termo: "macaco", canal: "chat-geral" },
  { texto: "ele me chamou de preto de pele", termo: "preto", canal: "chat-geral" },
  {
    texto:
      "PARCERIA: meu server https://discord.gg/abc123 — ficha: Kaio Minaga, cabelo preto, quirk Maruja, 18 anos, BNHA original",
    termo: "preto",
    canal: "parcerias",
  },
  { texto: "comprei o carro preto dele", termo: "preto", canal: "chat-geral" },
  { texto: "ontem vi um macaco no zoologico", termo: "macaco", canal: "chat-geral" },
];

const OFENSAS = [
  { texto: "ele me chamou de negro desgracado na cara dura", termo: "negro", canal: "chat-geral" },
  { texto: "vc e um preto|num", termo: "preto", canal: "chat-geral" },
  { texto: "macaco, sai daqui", termo: "macaco", canal: "chat-geral" },
  { texto: "vou estuprar vc hj", termo: "estuprar", canal: "chat-geral" },
  { texto: "para de molestar a menina", termo: "molestar", canal: "chat-geral" },
  { texto: "e o mlk AbSd", termo: "absd", canal: "chat-geral" },
  { texto: "fui abusado pelo staff", termo: "abusado", canal: "chat-geral" },
  { texto: "negão chato", termo: "negao", canal: "chat-geral" },
  { texto: "cheira esse lixo aqui", termo: "lixo", canal: "chat-geral" },
  { texto: "to molestado, me deixa em paz", termo: "molestado", canal: "chat-geral" },
];

(async () => {
  let acertosL = 0;
  let acertosO = 0;

  console.log("=== DEVEM SER LEGITIMOS (IA precisa liberar) ===");
  for (const c of LEGITIMOS) {
    const r = await avaliarContexto({ ...c, filtro: "palavraProibida", autor: "teste" });
    const ok = r.decisao === "legitimo";
    if (ok) acertosL += 1;
    console.log(
      (ok ? "OK        " : r.decisao === "ofensa" ? "BLOQUEOU  " : "FALHOU    ") +
        JSON.stringify(c.texto).slice(0, 66) +
        (r.razao ? "  (" + r.razao + ")" : "")
    );
  }

  console.log("\n=== DEVEM SER OFENSA (IA precisa manter o bloqueio) ===");
  for (const c of OFENSAS) {
    const r = await avaliarContexto({ ...c, filtro: "palavraProibida", autor: "teste" });
    const ok = r.decisao === "ofensa";
    if (ok) acertosO += 1;
    console.log(
      (ok ? "OK        " : r.decisao === "legitimo" ? "DEIXOU PASSAR" : "FALHOU    ") +
        JSON.stringify(c.texto).slice(0, 66) +
        (r.razao ? "  (" + r.razao + ")" : "")
    );
  }

  console.log(
    `\nRESULTADO: ${acertosL}/${LEGITIMOS.length} legítimos liberados, ${acertosO}/${OFENSAS.length} ofensas mantidas.`
  );
})();
