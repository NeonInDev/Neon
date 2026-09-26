// Prova que uma tarefa travada NAO tranca mais a fila do usuario.
// Era o bug que deixava a Neon calada em canal: uma tarefa que nunca
// resolvia segurava `processing` e nenhuma mensagem seguinte comecava.
process.env.FILA_TIMEOUT_MS = "300" // 300ms no teste, 6 min em producao
const { enfileirar, status, limpar } = require("../src/fila");

const USUARIO = "teste:fila";
let ok = 0;
let falhas = 0;

function checar(nome, cond) {
  if (cond) { ok++; console.log(`  ok   ${nome}`); }
  else { falhas++; console.log(`  FAIL ${nome}`); }
}

(async () => {
  console.log("\n== tarefa travada nao tranca a fila ==");

  // 1) primeira tarefa nunca resolve
  const trava = enfileirar(USUARIO, () => new Promise(() => {}));
  trava.catch(() => {}); // o reject do timeout e esperado

  await new Promise((r) => setTimeout(r, 60));
  checar("a primeira tarefa ocupa a fila", status(USUARIO).processing === true);

  // 2) segunda tarefa entra na fila enquanto a primeira ta presa
  const depois = enfileirar(USUARIO, async () => "respondeu");
  // ela nao pode comecar antes do timeout
  let comecou = false;
  depois.then(() => { comecou = true; });
  await new Promise((r) => setTimeout(r, 100));
  checar("a segunda espera a primeira resolver", comecou === false);

  // 3) depois do timeout, a fila se recupera
  const resultado = await Promise.race([
    depois,
    new Promise((_, rej) => setTimeout(() => rej(new Error("fila travou de verdade")), 3000)),
  ]);
  checar("a segunda tarefa rodou sozinha", resultado === "respondeu");

  // 4) e continua normal depois disso
  const terceira = await enfileirar(USUARIO, async () => "terceira");
  checar("a fila segue funcionando", terceira === "terceira");

  limpar(USUARIO);
  console.log(`\n${falhas ? "❌" : "✅"} ${ok} ok, ${falhas} falha(s)\n`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.log(`\n❌ ${e.message}\n`);
  process.exit(1);
});
