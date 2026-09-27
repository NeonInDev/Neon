// Testa a moderacao por fala natural (silenciar/warnar) sem punir ninguem.
// Só chama detectarCategoria, que classifica a frase; nenhum mute, warn ou
// escrita em data/ acontece aqui.
//
// O texto entra como o fala_comandos entrega: com o "neon," ja removido
// (fala_comandos.js:21), porque os detectores sao ancorados em ^.
//
//   node scripts/testar_moderacao_natural.js

require("dotenv").config();
const { detectarCategoria } = require("../src/actions");

// mesma limpeza do fala_comandos.js
const semPrefixo = (t) => String(t).replace(/^\s*(?:neon|<@!?\d+>)[\s,!.\-:;]*/i, "").trim();

let passou = 0;
let falhou = 0;

function cek(nome, texto, esperado) {
  const obtido = detectarCategoria(semPrefixo(texto));
  if (obtido === esperado) {
    console.log(`  ok    ${nome} -> ${obtido}`);
    passou += 1;
  } else {
    console.log(`  FALHA ${nome}\n          esperado: ${esperado}\n          obtido:   ${obtido}`);
    falhou += 1;
  }
}

// pro resto das frases o que importa e so que NAO vire moderacao
function cekNaoModeracao(nome, texto) {
  const obtido = detectarCategoria(semPrefixo(texto));
  if (obtido !== "silenciar_usuario" && obtido !== "warnar_usuario") {
    console.log(`  ok    ${nome} -> ${obtido} (nao e moderacao)`);
    passou += 1;
  } else {
    console.log(`  FALHA ${nome} virou ${obtido}, devia ser outra coisa`);
    falhou += 1;
  }
}

console.log("\n=== silenciar usuario (alvo = pessoa) ===");
cek("mencao do discord", "neon, silencia o <@123456789012345678>", "silenciar_usuario");
cek("arroba nome", "neon, silencia o @fulano", "silenciar_usuario");
cek("por favor", "neon, por favor silencia o @fulano", "silenciar_usuario");
cek("pf", "neon, pf silencia o @fulano", "silenciar_usuario");
cek("calla", "neon, calla o @fulano", "silenciar_usuario");
cek("com duracao", "neon, silencia o @fulano por 10 min", "silenciar_usuario");
cek("com motivo", "neon, silencia o @fulano por 2 dias", "silenciar_usuario");
cek("sem prefixo neon", "silencia o @fulano", "silenciar_usuario");

console.log("\n=== warns ===");
cek("warna", "neon, warna o @fulano", "warnar_usuario");
cek("dar warn", "neon, da um warn no @fulano", "warnar_usuario");
cek("advertir", "neon, adverte o @fulano por flood", "warnar_usuario");
cek("warn com duracao", "neon, warna o @fulano por 30 min", "warnar_usuario");

console.log("\n=== volume do PC NAO pode virar moderacao ===");
// o conflito original: "silencia o @fulano" mutava o audio do dono.
// "baixa o volume" e "abaixa o som" ja nao caem em encontrarVolume (gap antigo,
// fora deste cambio), entao so exigimos que nao virem moderacao.
cek("muta o microfone", "neon, muta o microfone", "volume");
cekNaoModeracao("silencia o som", "neon, silencia o som");
cekNaoModeracao("muta o audio", "neon, muta o audio");
cekNaoModeracao("baixa o volume", "neon, baixa o volume");
cekNaoModeracao("volume do fone", "neon, abaixa o som do fone");
cekNaoModeracao("silencia sem alvo", "neon, silencia");
cekNaoModeracao("aumenta o volume", "neon, aumenta o volume");

console.log("\n=== outras frases seguem intactas ===");
// spotify cai em codar_app, nao app: encontrarCodarApp e checado antes de
// encontrarApp na ordem de detectarCategoria.
cek("abre o spotify", "neon, abre o spotify", "codar_app");
cekNaoModeracao("pesquisa no google", "neon, pesquisa no google sobre oleo de coco");
cekNaoModeracao("como esta o pc", "neon, como esta o pc");
cekNaoModeracao("boa noite", "neon, boa noite");

console.log(`\n=== ${passou} ok, ${falhou} falha(s) ===`);
process.exit(falhou ? 1 : 0);
