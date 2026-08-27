// Patch idempotente: Neon sempre chama o dono de "chefe"
const fs = require("fs");
const path = require("path");

const AI = path.join(__dirname, "src", "ai.js");
const MARK = "@chefe";

let src = fs.readFileSync(AI, "utf8");

if (src.includes(MARK)) {
  console.log("patch_chefe: ja aplicado, nada a fazer.");
  process.exit(0);
}

let mudou = false;

if (!src.includes('require("./perm")')) {
  const novo = src.replace(
    'const { getModo, personaDoModo } = require("./modo");',
    'const { getModo, personaDoModo } = require("./modo");\nconst { isOwner } = require("./perm"); // ' + MARK
  );
  if (novo !== src) {
    src = novo;
    mudou = true;
  }
}

const bloco =
  'const tratamentoChefe = isOwner(userId)\n' +
  '  ? `\\n\\nREGRAS DE TRATAMENTO:\\n- O usuário com quem você fala é o seu DONO (o chefe). SEMPRE que for se dirigir a ele, chame-o de "chefe" (ex.: "Claro, chefe", "Feito, chefe", "Sim, chefe"). Nunca use "dono", "você" ou outro tratamento. Nunca o chame pelo nome de usuário.\\n\\n` // ' + MARK + '\n' +
  '  : "";\n\n';

const anchorSistema = "  const sistema = `${personaDoModo()}";
if (src.includes(anchorSistema)) {
  src = src.replace(anchorSistema, bloco + anchorSistema);
  mudou = true;
}

const close = "4. Responda em português brasileiro, de forma natural.`;";
if (src.includes(close)) {
  src = src.replace(close, "4. Responda em português brasileiro, de forma natural. ${tratamentoChefe}`;");
  mudou = true;
}

if (!mudou) {
  console.error("patch_chefe: ERRO - nao encontrei os pontos de ancoragem em src/ai.js.");
  process.exit(1);
}

fs.writeFileSync(AI, src);
console.log("patch_chefe: aplicado com sucesso.");
