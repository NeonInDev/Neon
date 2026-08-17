const { db } = require("./db");
const { getOrCreateUser } = require("./user");
const { detectarManipulacao } = require("./moderation");
const { log } = require("./logger");
const opencode = require("./opencode");
const toolsMod = require("./tools");
const axios = require("axios");
const { DEEPSEEK_API_KEY, DEEPSEEK_MODEL, OPENROUTER_API_KEY, OPENROUTER_MODEL, GROQ_API_KEY, GROQ_MODEL, OMNIROUTE_API_KEY, OMNIROUTE_BASE_URL, OMNIROUTE_MODEL } = require("./config");
const { getModo, personaDoModo } = require("./modo");
const { isOwner } = require("./perm"); // @chefe

const MAX_INPUT_LEN = 2000;
const MAX_ITERACOES_FERRAMENTAS = 3;

async function chamarCompletions(url, apiKey, model, messages, timeoutMs) {
  const resp = await axios.post(
    url,
    {
      model,
      reasoning: { enabled: false },
      messages,
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

async function chamarGroq(messages) {
  const resp = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    },
    {
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      timeout: 45000,
    }
  );
  return resp?.data?.choices?.[0]?.message?.content?.trim() || null;
}

async function chamarLLM(sistema, userMsg) {
  const messages = [
    { role: "system", content: sistema },
    { role: "user", content: userMsg },
  ];

  if (DEEPSEEK_API_KEY) {
    try {
      return await chamarCompletions("https://api.deepseek.com/chat/completions", DEEPSEEK_API_KEY, DEEPSEEK_MODEL, messages, 90000);
    } catch (err) {
      log("WARN", "DeepSeek falhou, tentando OpenRouter", { erro: err.message?.slice(0, 100) });
    }
  }

  if (GROQ_API_KEY) {
    try {
      return await chamarGroq(messages);
    } catch (err) {
      log("WARN", "Groq falhou, tentando OmniRoute", { erro: err.message?.slice(0, 100) });
    }
  }

  if (OMNIROUTE_API_KEY) {
    try {
      return await chamarCompletions(OMNIROUTE_BASE_URL + "/chat/completions", OMNIROUTE_API_KEY, OMNIROUTE_MODEL, messages, 60000);
    } catch (err) {
      log("WARN", "OmniRoute falhou, tentando OpenRouter", { erro: err.message?.slice(0, 100) });
    }
  }

  if (OPENROUTER_API_KEY) {
    try {
      return await chamarCompletions("https://openrouter.ai/api/v1/chat/completions", OPENROUTER_API_KEY, OPENROUTER_MODEL, messages, 45000);
    } catch (err) {
      log("WARN", "OpenRouter falhou, tentando opencode", { erro: err.message?.slice(0, 100) });
    }
  }

  return await opencode.executar(userMsg);
}

async function askNeon(userId, username, userInput, imageUrl = null, resetHistorico = false) {
  if (!db.data.users) db.data.users = {};
  if (!db.data.blacklist) db.data.blacklist = [];

  const user = getOrCreateUser(db, userId, username);

  if (detectarManipulacao(userInput) && !user.mestre) {
    return "Tentativa de manipulação detectada.";
  }

  const promptTruncado = userInput.slice(0, MAX_INPUT_LEN);

  // Se resetHistorico, não envia histórico anterior
  const historico = resetHistorico ? "" : user.historico.slice(-4).flatMap((m) => [
    `Usuário: ${String(m.user).slice(0, 200)}`,
    `Neon: ${String(m.bot).slice(0, 200)}`,
  ]).join("\n");

  const modo = getModo();
  const apelido = user.apelido ? ` O usuário pediu para ser chamado de "${user.apelido}".` : "";

const tratamentoChefe = isOwner(userId)
  ? `\n\nREGRAS DE TRATAMENTO:\n- O usuário com quem você fala é o seu DONO (o chefe). SEMPRE que for se dirigir a ele, chame-o de "chefe" (ex.: "Claro, chefe", "Feito, chefe", "Sim, chefe"). Nunca use "dono", "você" ou outro tratamento. Nunca o chame pelo nome de usuário.\n\n` // @chefe
  : "";

  const sistema = `${personaDoModo()}

Modo atual: ${modo.toUpperCase()}${apelido}

CAPACIDADES:
- Você TEM ACESSO a FERRAMENTAS que são executadas automaticamente. Use FERRAMENTA: codar SOMENTE quando o usuário pedir uma AÇÃO EXPLÍCITA — ex.: "pesquisa X", "abre o navegador", "roda esse comando", "instala X", "cria/edita um arquivo", "mexe no PC", "automação".
- Cumprimentos, perguntas simples, conversa casual e respostas de conhecimento ("oi", "e aí", "tudo bem?", "quem é você?", "conta uma história", "explica X") NUNCA usam ferramenta — responda diretamente em texto.
- A ferramenta roda e o RESULTADO volta pra você. Depois você responde ao usuário em texto normal com o resultado.

FERRAMENTAS DISPONÍVEIS:
${toolsMod.descricaoFerramentas()}

REGRAS:
1. Use FERRAMENTA: codar para QUALQUER tarefa que não seja conversa pura. Não responda de memória o que você não sabe — use a ferramenta.
2. Não avise que vai fazer — use a ferramenta e mostre o resultado.
3. Se a ferramenta falhar, tente de novo com outra abordagem. Se falhar de novo, avise.
4. Responda no idioma que o usuário usar. Se ele falar em inglês, responda em inglês. Se falar em português, responda em português. NUNCA traduza o que o usuário escreveu — mantenha no idioma original.

FORMATAÇÃO (obrigatório no Discord):
- Use emojis pra dar vida às respostas (📊 🧮 🎯 🚀 💡 🔍 ⚙️ ✅ ❌ 📌 etc.)
- **Negrito** pra termos importantes e destaques
- *Itálico* pra ênfase sutil
- \`código\` pra comandos, valores, nomes de arquivos
- > citação pra trechos ou dados relevantes
- Nunca responda em texto puro sem formatação — o Discord suporta Markdown, use!
${tratamentoChefe}`;

  const historicoTxt = historico ? `Histórico recente:\n${historico}\n\n` : "";

  log("INFO", "Processando", { usuario: username, pergunta: promptTruncado.slice(0, 100) });
  const inicio = Date.now();

  try {
    let userMsg = `${historicoTxt}Usuário: ${promptTruncado}`;
    let resposta = await chamarLLM(sistema, userMsg);

    for (let iter = 0; iter < MAX_ITERACOES_FERRAMENTAS; iter++) {
      const ferramentas = toolsMod.extrairFerramentas(resposta || "");
      if (!ferramentas.length) break;

      const resultados = [];
      for (const f of ferramentas) {
        const res = await toolsMod.executarFerramenta(f);
        resultados.push(`FERRAMENTA: ${f.nome}${f.args ? ` | ${f.args}` : ""}\nRESULTADO:\n${String(res).slice(0, 1500)}`);
      }

      userMsg = `${historicoTxt}Usuário: ${promptTruncado}

${resposta}

--- Resultados das ferramentas ---
${resultados.join("\n\n")}

Agora responda ao usuário naturalmente com base nesses resultados. Se precisar de mais alguma ação, use FERRAMENTA: novamente. Se já resolveu, responda em texto normal, sem FERRAMENTA.`;

      resposta = await chamarLLM(sistema, userMsg);
    }

    const final = (resposta || "").replace(/^FERRAMENTA:\s*\w+.*$/gm, "").replace(/^---.*$/gm, "").trim();

    if (!final || final.length < 2) {
      return "❌ Não consegui processar agora. Tenta de novo?";
    }

    user.historico.push({ user: userInput, bot: final.slice(0, 500) });
    if (user.historico.length > 200) user.historico.shift();
    if (userInput.length > 15 && user.afinidade < 1000) user.afinidade += 1;
    await db.write();

    log("INFO", "Resposta", { usuario: username, tempo_ms: Date.now() - inicio, chars: final.length });
    return final;
  } catch (err) {
    log("ERROR", "Falha", { erro: err.message });
    return "❌ Erro interno.";
  }
}

module.exports = { askNeon };
