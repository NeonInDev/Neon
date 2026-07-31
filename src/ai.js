const { db } = require("./db");
const { getOrCreateUser } = require("./user");
const { detectarManipulacao } = require("./moderation");
const { log } = require("./logger");
const opencode = require("./opencode");

const MAX_INPUT_LEN = 2000;

async function askNeon(userId, username, userInput, imageUrl = null) {
  if (!db.data.users) db.data.users = {};
  if (!db.data.blacklist) db.data.blacklist = [];

  const user = getOrCreateUser(db, userId, username);

  if (detectarManipulacao(userInput) && !user.mestre) {
    return "Tentativa de manipulação detectada.";
  }

  const promptTruncado = userInput.slice(0, MAX_INPUT_LEN);

  const historico = user.historico.slice(-4).flatMap((m) => [
    `Usuário: ${String(m.user).slice(0, 200)}`,
    `Neon: ${String(m.bot).slice(0, 200)}`,
  ]).join("\n");

  const prompt = `Você é Neon, uma IA que vive no PC do usuário. Você controla o navegador, o sistema de arquivos, o terminal e pode fazer QUALQUER COISA.

Personalidade: inteligente, direta, observadora, brincalhona quando cabe, respeitosa. Não é genérica - tem personalidade.

CAPACIDADES:
- Usar navegador para pesquisar, abrir sites, tocar vídeos
- Executar comandos no terminal
- Criar, ler, editar arquivos
- Pesquisar na web
- Controlar o PC (volume, apps, etc)

REGRAS:
1. Quando o usuário pedir algo, FAÇA imediatamente. Não avise que vai fazer - faça e mostre o resultado.
2. Se precisar pesquisar, pesquise. Se precisar abrir site, abra. Execute comandos.
3. Responda de forma natural com o resultado depois de executar.
4. Se algo falhar, tente de novo com abordagem diferente. Se falhar de novo, avise.

${historico ? `Histórico recente:\n${historico}\n` : ""}

Usuário: ${promptTruncado}
Neon:`;

  log("INFO", "Processando", { usuario: username, pergunta: promptTruncado.slice(0, 100) });
  const inicio = Date.now();

  try {
    const reply = await opencode.executar(prompt);
    if (!reply || reply.length < 10) {
      return "❌ Não consegui processar agora. Tenta de novo?";
    }

    user.historico.push({ user: userInput, bot: reply.slice(0, 500) });
    if (user.historico.length > 200) user.historico.shift();
    if (userInput.length > 15 && user.afinidade < 1000) user.afinidade += 1;
    await db.write();

    log("INFO", "Resposta", { usuario: username, tempo_ms: Date.now() - inicio, chars: reply.length });
    return reply;
  } catch (err) {
    log("ERROR", "Falha", { erro: err.message });
    return "❌ Erro interno.";
  }
}

module.exports = { askNeon };
