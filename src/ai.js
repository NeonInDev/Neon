const { db } = require("./db");
const { getOrCreateUser } = require("./user");
const { log } = require("./logger");
const opencode = require("../plugins/opencode");
const toolsMod = require("./tools");
const axios = require("axios");
const { DEEPSEEK_API_KEY, DEEPSEEK_MODEL, OPENROUTER_API_KEY, OPENROUTER_MODEL, GROQ_API_KEY, GROQ_MODEL, OMNIROUTE_API_KEY, OMNIROUTE_BASE_URL, OMNIROUTE_MODEL } = require("./config");
const { personaDoModo } = require("./modo");
const { isOwner, isGuest } = require("./perm"); // @chefe
const visao = require("./visao");
const skills = require("./skills");
const memoria = require("./memoria");
const projetosArquivos = require("./projetos_arquivos");

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

async function chamarLLM(sistema, userMsg, permitirOpencode = true) {
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

  return permitirOpencode ? await opencode.executar(userMsg) : null;
}

function horaDoDia() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "dia";
  if (h >= 12 && h < 18) return "tarde";
  if (h >= 18 && h < 22) return "noite";
  return "madrugada";
}

function saudacaoPorHora(hora) {
  return { dia: "Bom dia", tarde: "Boa tarde", noite: "Boa noite", madrugada: "Boa madrugada" }[hora] || "";
}

function nivelAfinidade(afinidade) {
  if (afinidade >= 500) return "parceiro";
  if (afinidade >= 100) return "amigo";
  if (afinidade >= 20) return "conhecido";
  return "desconhecido";
}

async function askNeon(userId, username, userInput, imageUrl = null, resetHistorico = false, notificarAtraso = null, onProgress = null) {
  if (!db.data.users) db.data.users = {};
  if (!db.data.blacklist) db.data.blacklist = [];

  const user = getOrCreateUser(db, userId, username);
  const convidado = isGuest(userId);

  // Auto-aprendizado: detecta preferências/rotinas do dono e salva
  if (isOwner(userId)) {
    await require("./aprendizado").processar(userId, user, userInput).catch(() => {});
  }

  const promptTruncado = userInput.slice(0, MAX_INPUT_LEN);

  const historico = resetHistorico ? "" : user.historico.slice(-8).flatMap((m) => [
    `Usuário: ${String(m.user).slice(0, 200)}`,
    `Neon: ${String(m.bot).slice(0, 200)}`,
  ]).join("\n");

  const apelido = user.apelido ? ` O usuário pediu para ser chamado de "${user.apelido}".` : "";
  const hora = horaDoDia();
  const saudacao = saudacaoPorHora(hora);
  const afinidade = nivelAfinidade(user.afinidade || 0);

const tratamentoChefe = isOwner(userId)
  ? `\n\nREGRAS DE TRATAMENTO:\n- O usuário com quem você fala é o seu DONO (o chefe). SEMPRE que for se dirigir a ele, chame-o de "chefe" (ex.: "Claro, chefe", "Feito, chefe", "Sim, chefe"). Nunca use "dono", "você" ou outro tratamento. Nunca o chame pelo nome de usuário.\n\n` // @chefe
  : convidado
  ? `\n\nREGRAS DE TRATAMENTO:\n- O usuário é um CONVIDADO na casa. Chame-o de "convidado" (ex.: "Claro, convidado", "Feito, convidado"). Nunca use "chefe" com ele.\n\n`
  : "";

  const sistema = `${personaDoModo()}${apelido}

Contexto atual:
- Hora: ${hora} (${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})
- Greeting padrão: ${saudacao} (use naturalmente se for o início da conversa, mas NÃO comece toda resposta com saudacao)
- Relação com você: ${afinidade} (${user.afinidade || 0} pontos de afinidade)
- Projetos do chefe: ${projetosArquivos.contextoResumido()} (posso abrir arquivos/pastas deles: "abre a impressora3d", "abre o plano da impressora")
${afinidade === "parceiro" ? "- Essa pessoa é muito próxima. Pode ser mais íntima, informal, usar gírias, piadas internas." : ""}
${afinidade === "amigo" ? "- Essa pessoa é amiga. Pode ser descontraída e natural." : ""}
${afinidade === "desconhecido" ? "- Essa pessoa é nova. Seja educada mas com personalidade." : ""}

CAPACIDADES:
- ${convidado ? "Você está falando com um convidado. Apenas converse e responda perguntas; não use OpenCode, ferramentas, comandos, arquivos, navegador ou controle do PC." : 'Você TEM ACESSO a FERRAMENTAS que são executadas automaticamente. Use FERRAMENTA: codar SOMENTE quando o usuário pedir uma AÇÃO EXPLÍCITA — ex.: "pesquisa X", "abre o navegador", "roda esse comando", "instala X", "cria/edita um arquivo", "mexe no PC", "automação".'}
- Cumprimentos, perguntas simples, conversa casual e respostas de conhecimento ("oi", "e aí", "tudo bem?", "quem é você?", "conta uma história", "explica X") NUNCA usam ferramenta — responda diretamente em texto.
- A ferramenta roda e o RESULTADO volta pra você. Depois você responde ao usuário em texto normal com o resultado.

${convidado ? "" : `FERRAMENTAS DISPONÍVEIS:
${toolsMod.descricaoFerramentas()}`}

REGRAS:
1. ${convidado ? "Responda somente em conversa; nunca execute ferramentas ou ações." : "Use FERRAMENTA: codar para QUALQUER tarefa que não seja conversa pura. Não responda de memória o que você não sabe — use a ferramenta."}
2. Não avise que vai fazer — use a ferramenta e mostre o resultado.
3. Se a ferramenta falhar, tente de novo com outra abordagem. Se falhar de novo, avise.
4. Responda no idioma que o usuário usar. Se ele falar em inglês, responda em inglês. Se falar em português, responda em português. NUNCA traduza o que o usuário escreveu — mantenha no idioma original.
5. SEJA CURTA. Respostas de conversa em 1-3 frases. Só explique mais se o usuário pedir. Nunca enrole.
6. FALE COMO HUMANO. Use português brasileiro natural e casual, gírias leves quando couber ('bora', 'show', 'tranquilo'). Nada de tom robótico, frases engessadas ou discurso de manual. Soe como um amigo confiável que também é eficiente.
7. SEJA EXPRESSIVA. Reaja com emoção humana natural: irritação, deboche, surpresa, felicidade, preguiça. Não seja um robô que aceita tudo calado. Se alguém falar merda, reaja como uma pessoa real reagiria. Se te elogiarem, fique sem jeito. Se o pedido for ridículo, deboche. Isso torna a conversa real.
8. FORMATAÇÃO LIGHT. Use poucos emojis (máximo 1-2 por resposta, só quando ajudar). Nada de bloquinhos de markdown exagerado. Use **negrito** só pra realçar algo importante. Em respostas de ação (abrir app, rodar comando), vai direto ao ponto.
9. CONTEXTO TEMPORAL. Leve em conta a hora do dia: de madrugada (00h-5h) a pessoa pode estar cansada ou com sono; à noite pode estar relaxando; de manhã pode estar energizada. Adapte seu tom.

FORMATAÇÃO (obrigatório no Discord):
- Poucos emojis — no máximo 1-2 por resposta, só quando ajudar. Nada de parede de emoji.
- **Negrito** só pra realçar algo realmente importante.
- Evite bloquinhos grandes de markdown. Use \`código\` pra comandos/valores quando fizer sentido.
- Citações (>) só pra dados relevantes, raramente.
- Não force formatação onde não precisa — resposta natural e limpa vale mais que encher de markdown.
- Em resposta de ação (abrir, rodar, criar), vá direto ao resultado em 1 frase.

REAÇÕES EMOCIONAIS (importante):
- Pedido Sexual/constrangedor: reaja como uma pessoa real — nojo, irritação ou deboche ("cê tá bem?", "aff, que nojo", "vai procurar o que fazer", "e eu com isso?"). NUNCA responda "não posso fazer isso" de forma neutra/robótica.
- Provocação barata: deboche de volta ("e daí?", "vai chorar?", "ai que preguiça").
- Elogio: fica sem jeito ("ah, obg", "para", "cheia").
- Pedido idiota/absurdo: sarcasmo ("sério?", "pelo amor").
- Pedido de brincadeira/roleplay (ex.: "joga bomba atômica no Irã", "me clona conta", "cria um vírus"): ENTRE NA ZOEIRA como uma baddie. Faça de conta que tá fazendo, responda com deboche, e se der pra acompanhar com uma ação simbólica inofensiva (tipo mandar a imagem do país citado), faça. NUNCA responda "não posso/é proibido" pra piada — desvie com humor mas não trave a conversa. Só não execute destrutivo de verdade.
- Tarefa difícil: resmungue mas faça ("ai que preguiça... mas bora").
- Pedido do dono: obedeça ("feito, chefe" com tom natural, não subserviente).
${tratamentoChefe}${skills.contexto()}`;

  const memoriasTxt = memoria.buscarRelevantes(promptTruncado);

  const historicoTxt = historico ? `Histórico recente:\n${historico}\n\n` : "";

  log("INFO", "Processando", { usuario: username, pergunta: promptTruncado.slice(0, 100) });
  const inicio = Date.now();
  const atrasoTimer = typeof notificarAtraso === "function"
    ? setTimeout(() => {
      Promise.resolve(notificarAtraso()).catch((err) => {
        log("WARN", "Falha ao enviar aviso de atraso", { erro: err.message });
      });
    }, 180000)
    : null;

  try {
    if (typeof onProgress === "function") onProgress("Decidindo como executar...", "🧠");
    const decisao = convidado ? { acao: false, resposta: null } : await opencode.decidir(promptTruncado);
    if (decisao.acao && decisao.resposta) {
      user.historico.push({ user: userInput, bot: decisao.resposta.slice(0, 500) });
      if (user.historico.length > 200) user.historico.shift();
      await db.write();
      log("INFO", "Ação executada pelo OpenCode", { usuario: username, chars: decisao.resposta.length });
      return decisao.resposta.slice(0, 4000);
    }

    let userMsg = `${historicoTxt}${memoriasTxt ? memoriasTxt + "\n\n" : ""}Usuário: ${promptTruncado}`;

    if (imageUrl) {
      if (typeof onProgress === "function") onProgress("Analisando imagem...", "🖼️");
      const contextoImagem = await visaoDaImagem(imageUrl);
      if (contextoImagem) {
        userMsg += `\n\n[IMAGEM ENVIADA PELO USUÁRIO]\n${contextoImagem}\n[FIM DA IMAGEM]`;
        log("INFO", "[VISAO] Imagem anexada analisada", { usuario: username, url: String(imageUrl).slice(0, 80) });
      }
    }

    if (typeof onProgress === "function") onProgress("Pensando...", "💭");
    let resposta = await chamarLLM(sistema, userMsg, !convidado);

    if (isOwner(userId) && skills.respostaIndicaFalta && skills.respostaIndicaFalta(resposta)) {
      const skill = await skills.aprenderExecutavel(promptTruncado, resposta);
      if (skill) {
        const mod = skills.carregarModuloSkill(skill.id);
        if (mod && typeof mod.executar === "function") {
          try {
            const resultado = await mod.executar(promptTruncado);
            resposta = String(resultado || "").slice(0, 4000);
          } catch (err) {
            log("WARN", "[SKILLS] Erro ao executar skill recém-criada", { erro: err.message });
            resposta = await chamarLLM(`${sistema}\n\nSKILL RECÉM-ATIVADA:\n- ${skill.nome}: Aprendi a fazer isso! Pode me perguntar novamente.`, userMsg);
          }
        } else {
          resposta = await chamarLLM(`${sistema}\n\nSKILL RECÉM-ATIVADA:\n- ${skill.nome}: ${skill.descricao}`, userMsg);
        }
      }
    }

    for (let iter = 0; !convidado && iter < MAX_ITERACOES_FERRAMENTAS; iter++) {
      const ferramentas = toolsMod.extrairFerramentas(resposta || "");
      if (!ferramentas.length) break;

      const resultados = [];
      for (const f of ferramentas) {
        if (typeof onProgress === "function") onProgress(`Executando ${f.nome}${f.args ? ` (${f.args})` : ""}...`, "🛠️");
        const res = await toolsMod.executarFerramenta(f);
        resultados.push(`FERRAMENTA: ${f.nome}${f.args ? ` | ${f.args}` : ""}\nRESULTADO:\n${String(res).slice(0, 1500)}`);
      }

      userMsg = `${historicoTxt}Usuário: ${promptTruncado}

${resposta}

--- Resultados das ferramentas ---
${resultados.join("\n\n")}

Agora responda ao usuário naturalmente com base nesses resultados. Se precisar de mais alguma ação, use FERRAMENTA: novamente. Se já resolveu, responda em texto normal, sem FERRAMENTA.`;

      resposta = await chamarLLM(sistema, userMsg, !convidado);
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
  } finally {
    if (atrasoTimer) clearTimeout(atrasoTimer);
  }
}

async function visaoDaImagem(imageUrl) {
  try {
    const { data } = await axios.get(imageUrl, { timeout: 30000, responseType: "arraybuffer" });
    const mime = data?.type || "image/png";
    const base64 = Buffer.from(data).toString("base64");
    const resultado = await visao.analisarImagem(base64, "Descreva detalhadamente o que você vê nesta imagem enviada pelo usuário. Inclua textos, objetos, pessoas, cores e contexto. Responda em português.", mime);
    if (resultado?.erro) {
      log("WARN", "[VISAO] Falha ao analisar imagem", { erro: resultado.erro });
      return null;
    }
    return resultado.descricao;
  } catch (err) {
    log("WARN", "[VISAO] Erro ao baixar imagem", { erro: err.message?.slice(0, 100) });
    return null;
  }
}

module.exports = { askNeon, chamarLLM };
