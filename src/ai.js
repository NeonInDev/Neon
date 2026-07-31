const { db } = require("./db");
const { getOrCreateUser } = require("./user");
const { detectarManipulacao } = require("./moderation");
const { log } = require("./logger");
const opencode = require("./opencode");
const axios = require("axios");
const { DEEPSEEK_API_KEY, DEEPSEEK_MODEL, OPENROUTER_API_KEY, OPENROUTER_MODEL } = require("./config");
const { getModo, personaDoModo } = require("./modo");

const MAX_INPUT_LEN = 2000;

async function chamarCompletions(url, apiKey, model, prompt, timeoutMs) {
  const resp = await axios.post(
    url,
    {
      model,
      reasoning: { enabled: false },
      messages: [
        { role: "system", content: personaDoModo() },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    },
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: timeoutMs,
    }
  );
  return resp?.data?.choices?.[0]?.message?.content?.trim() || null;
}

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

  const modo = getModo();
  const apelido = user.apelido ? ` O usuário pediu para ser chamado de "${user.apelido}".` : "";

  const prompt = `${personaDoModo()}

Modo atual: ${modo.toUpperCase()}${apelido}

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
    let reply = null;

    if (DEEPSEEK_API_KEY) {
      try {
        reply = await chamarCompletions("https://api.deepseek.com/chat/completions", DEEPSEEK_API_KEY, DEEPSEEK_MODEL, prompt, 90000);
      } catch (err) {
        log("WARN", "DeepSeek falhou, tentando OpenRouter", { erro: err.message?.slice(0, 100) });
      }
    }

    if (!reply && OPENROUTER_API_KEY) {
      try {
        reply = await chamarCompletions("https://openrouter.ai/api/v1/chat/completions", OPENROUTER_API_KEY, OPENROUTER_MODEL, prompt, 45000);
      } catch (err) {
        log("WARN", "OpenRouter falhou, tentando opencode", { erro: err.message?.slice(0, 100) });
      }
    }

    if (!reply) {
      reply = await opencode.executar(prompt);
    }

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
