// Verifica o parsing de alvo e motivo da moderacao por fala natural.
// parsearModeracao e pura (nao toca em guild, data/ nem rede), entao da para
// testar direto sem punir ninguem.
//
//   node scripts/testar_parse_moderacao.js

require("dotenv").config();
const { parsearModeracao } = require("../src/actions");

let passou = 0;
let falhou = 0;

function cek(nome, texto, alvoEsperado, motivoEsperado) {
  const r = parsearModeracao(texto);
  const alvo = r.alvo;
  const alvoTxt = alvo ? (alvo.tipo === "id" ? `id:${alvo.id}` : `nome:${alvo.nome}`) : "nenhum";
  const okA = alvoTxt === alvoEsperado;
  const okM = r.motivo === motivoEsperado;
  if (okA && okM) {
    console.log(`  ok    ${nome} -> alvo=${alvoTxt} motivo=${JSON.stringify(r.motivo)}`);
    passou += 1;
  } else {
    console.log(`  FALHA ${nome}\n          alvo:     esperado ${alvoEsperado} / obtido ${alvoTxt}\n          motivo:   esperado ${JSON.stringify(motivoEsperado)} / obtido ${JSON.stringify(r.motivo)}`);
    falhou += 1;
  }
}

console.log("\n=== alvo ===");
cek("mencao do discord", "silencia o <@123456789012345678>", "id:123456789012345678", "");
cek("mencao com !", "silencia o <@!123456789012345678>", "id:123456789012345678", "");
cek("arroba nome", "silencia o @fulaninho", "nome:fulaninho", "");
cek("arroba com ponto", "warna o @fulano.exe", "nome:fulano.exe", "");

console.log("\n=== motivo: duracao NAO pode virar motivo ===");
// nome com 2+ caracteres: ALVO_ARROBA exige de 2 a 32, "@x" nao casa
cek("so duracao", "silencia o @fulano por 10 min", "nome:fulano", "");
cek("duracao em dias", "silencia o @fulano por 2 dias", "nome:fulano", "");
cek("duracao compacta", "silencia o @fulano por 1h30", "nome:fulano", "");
cek("motivo + duracao", "warna o @fulano por flood em 10 min", "nome:fulano", "flood");
cek("motivo com duracao atras", "warna o @fulano por 5 dias de flood", "nome:fulano", "de flood");
cek("so motivo", "warna o @fulano por flood", "nome:fulano", "flood");
cek("motivo composto", "warna o @fulano por spam no chat", "nome:fulano", "spam no chat");
cek("sem por", "silencia o @fulano", "nome:fulano", "");

console.log(`\n=== ${passou} ok, ${falhou} falha(s) ===`);
process.exit(falhou ? 1 : 0);
