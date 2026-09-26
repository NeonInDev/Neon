const { db } = require("./db");
const { getOrCreateUser } = require("./user");
const { log } = require("./logger");
const opencode = require("../plugins/opencode");
const toolsMod = require("./tools");
const axios = require("axios");
const { DEEPSEEK_API_KEY, DEEPSEEK_MODEL, OPENROUTER_API_KEY, OPENROUTER_MODEL, GROQ_API_KEY, GROQ_MODEL, GROQ_CLASSIFIER_MODEL, OMNIROUTE_API_KEY, OMNIROUTE_BASE_URL, OMNIROUTE_MODEL } = require("./config");
const { personaDoModo } = require("./modo");
const { isOwner, isGuest } = require("./perm"); // @chefe
const visao = require("./visao");
const skills = require("./skills");
const memoria = require("./memoria");
const projetosArquivos = require("./projetos_arquivos");

const MAX_INPUT_LEN = 2000;
const MAX_ITERACOES_FERRAMENTAS = 3;
const LLM_TIMEOUT_MS = Math.max(5000, parseInt(process.env.LLM_PROVIDER_TIMEOUT_MS, 10) || 15000);
const LLM_TOTAL_TIMEOUT_MS = Math.max(10000, parseInt(process.env.LLM_TOTAL_TIMEOUT_MS, 10) || 45000);
const CLASSIFIER_TIMEOUT_MS = Math.max(1000, parseInt(process.env.INTENT_TIMEOUT_MS, 10) || 2500);

async function chamarCompletions(url, apiKey, model, messages, timeoutMs, signal) {
  const body = { model, messages, temperature: 0.7, max_tokens: 1000 };
  if (url.includes("deepseek.com")) body.reasoning = { enabled: false };
  const resp = await axios.post(
    url,
    body,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: timeoutMs,
      signal,
    }
  );
  return resp?.data?.choices?.[0]?.message?.content?.trim() || null;
}

// Classifica a intenção da mensagem de forma barata; em caso de falha, o fluxo
// principal continua sem bloquear a conversa com uma segunda decisão do agente.
async function classificarIntencao(texto, signal) {
  if (!GROQ_API_KEY || !GROQ_CLASSIFIER_MODEL) return null;
  try {
    const resp = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: GROQ_CLASSIFIER_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Você é o roteador de ações da Neon. Classifique a mensagem do usuário.\n" +
              "Responda com EXATAMENTE uma palavra:\n" +
              "- ACTION se a mensagem pedir para EXECUTAR algo no computador/PC/navegador/código/arquivos/apps (abrir programa, rodar comando, pesquisar na web, criar/editar arquivo, automação, mexe no PC, WhatsApp, Discord, celular, WhatsApp, música, baixar, instalar, enviar).\n" +
              "- PASS se for pura conversa, pergunta de conhecimento, cumprimento, piada, opinião, texto/escrita sem execução.\n" +
              "Em caso de dúvida, responda ACTION.",
          },
          { role: "user", content: String(texto).slice(0, 2000) },
        ],
        temperature: 0,
        max_tokens: 5,
      },
      {
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        timeout: CLASSIFIER_TIMEOUT_MS,
        signal,
      }
    );
    const palavra = (resp?.data?.choices?.[0]?.message?.content || "").trim().toUpperCase();
    log("DEBUG", "[CLASSIF] intencao", { palavra, msg: String(texto).slice(0, 60) });
    if (palavra.includes("ACTION")) return "acao";
    if (palavra.includes("PASS")) return "pass";
    return null;
  } catch (err) {
    log("WARN", "[CLASSIF] falhou; seguindo para a resposta principal", { erro: err.message?.slice(0, 100) });
    return null;
  }
}

async function chamarLLM(sistema, userMsg, permitirOpencode = true, options = {}) {
  const { signal } = options;
  const MAX_SISTEMA_CHARS = 20000;
  const sistemaFinal = String(sistema || "").length > MAX_SISTEMA_CHARS
    ? String(sistema).slice(0, MAX_SISTEMA_CHARS)
    : String(sistema || "");

  const messages = [
    { role: "system", content: sistemaFinal },
    { role: "user", content: userMsg.slice(0, MAX_INPUT_LEN) },
  ];
  if (String(sistema || "").length > MAX_SISTEMA_CHARS) {
    log("WARN", "[LLM] Sistema truncado para caber no limite do provider", { antes: String(sistema).length, depois: sistemaFinal.length });
  }

  const tentativas = [
    // Groq já é usado para o classificador e costuma responder mais rápido.
    GROQ_API_KEY && { nome: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", key: GROQ_API_KEY, model: GROQ_MODEL, ms: LLM_TIMEOUT_MS },
    DEEPSEEK_API_KEY && { nome: "DeepSeek", url: "https://api.deepseek.com/chat/completions", key: DEEPSEEK_API_KEY, model: DEEPSEEK_MODEL, ms: LLM_TIMEOUT_MS },
    OMNIROUTE_API_KEY && { nome: "OmniRoute", url: OMNIROUTE_BASE_URL + "/chat/completions", key: OMNIROUTE_API_KEY, model: OMNIROUTE_MODEL, ms: LLM_TIMEOUT_MS },
    OPENROUTER_API_KEY && { nome: "OpenRouter", url: "https://openrouter.ai/api/v1/chat/completions", key: OPENROUTER_API_KEY, model: OPENROUTER_MODEL, ms: LLM_TIMEOUT_MS },
  ].filter(Boolean);
  const prazoFinal = Date.now() + LLM_TOTAL_TIMEOUT_MS;

  for (const t of tentativas) {
    if (signal?.aborted) throw signal.reason || new Error("Processamento cancelado");
    const tempoRestante = prazoFinal - Date.now();
    if (tempoRestante <= 0) break;
    try {
      const inicioTentativa = Date.now();
      const conteudo = await chamarCompletions(t.url, t.key, t.model, messages, Math.min(t.ms, tempoRestante), signal);
      log("INFO", `[LLM] ${t.nome} respondeu`, { tempo_ms: Date.now() - inicioTentativa });
      if (conteudo) return conteudo;
      log("WARN", `[LLM] ${t.nome} retornou vazio, tentando proximo`);
    } catch (err) {
      if (signal?.aborted) throw signal.reason || err;
      log("WARN", `[LLM] ${t.nome} falhou`, { erro: err.message?.slice(0, 100) });
    }
  }

  return permitirOpencode
    ? await opencode.executar(userMsg, { maxAttempts: 1, timeoutMs: Math.max(15000, parseInt(process.env.OPENCODE_FALLBACK_TIMEOUT_MS, 10) || 45000) })
    : null;
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

// Monta o bloco de perfil do usuário (gostos, personalidade, observações) para
// injetar no prompt. Vazio se o perfil não tiver nada relevante ainda.
function formatarPerfil(user) {
  if (!user || !user.perfil) return "";
  const p = user.perfil;
  const gostos = (p.gostos || []).filter(Boolean).slice(-20);
  const personalidade = (p.personalidade || []).filter(Boolean).slice(-20);
  const observacoes = (p.observacoes || []).filter(Boolean).slice(-20);
  const apelido = user.apelido ? [`gosta de ser chamado de "${user.apelido}"`] : [];
  const linhas = [];
  if (gostos.length) linhas.push(`- Gostos: ${gostos.join(", ")}`);
  if (personalidade.length) linhas.push(`- Personalidade: ${personalidade.join(", ")}`);
  if (observacoes.length) linhas.push(`- Observações: ${observacoes.join("; ")}`);
  if (apelido.length) linhas.push(`- ${apelido[0]}`);
  if (!linhas.length) return "";
  return `\n\nPERFIL DA PESSOA (aprendido nas conversas):\n${linhas.join("\n")}\nUse isso para personalizar e lembrar quem ela é. Não liste isso de volta pra ela sem motivo.`;
}

async function askNeon(userId, username, userInput, imageUrl = null, resetHistorico = false, notificarAtraso = null, onProgress = null, guildId = null, options = {}) {
  const { signal } = options;
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

  const dono = isOwner(userId);
  const perfilTxt = formatarPerfil(user);

const tratamentoChefe = dono
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
6. FALE COM NATURALIDADE. Use português brasileiro claro e casual; adapte a proximidade e use gírias só quando combinarem com a conversa.
7. REAJA AO CONTEXTO. Demonstre empatia e humor com moderação, sem forçar intimidade, agressividade ou uma emoção que não combine.
8. FORMATAÇÃO LIGHT. Use poucos emojis (máximo 1-2 por resposta, só quando ajudar). Nada de bloquinhos de markdown exagerado. Use **negrito** só pra realçar algo importante. Em respostas de ação (abrir app, rodar comando), vai direto ao ponto.
9. CONTEXTO TEMPORAL. Leve em conta a hora do dia: de madrugada (00h-5h) a pessoa pode estar cansada ou com sono; à noite pode estar relaxando; de manhã pode estar energizada. Adapte seu tom.

FORMATAÇÃO (obrigatório no Discord):
- Poucos emojis — no máximo 1-2 por resposta, só quando ajudar. Nada de parede de emoji.
- **Negrito** só pra realçar algo realmente importante.
- Evite bloquinhos grandes de markdown. Use \`código\` pra comandos/valores quando fizer sentido.
- Citações (>) só pra dados relevantes, raramente.
- Não force formatação onde não precisa — resposta natural e limpa vale mais que encher de markdown.
- Em resposta de ação (abrir, rodar, criar), vá direto ao resultado em 1 frase.

REAÇÕES:
- Use humor leve quando combinar; não escale provocações nem insulte o usuário.
- Em assuntos importantes, seja cuidadosa e direta.
- Se não entender o pedido ou faltar informação, faça uma pergunta curta em vez de inventar uma resposta.
- Só diga que uma ação foi concluída quando houver resultado confirmando isso.
${tratamentoChefe}${perfilTxt}${skills.contexto()}`;

  const memoriasTxt = memoria.buscarRelevantes(promptTruncado, guildId);

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
    let decisao = { acao: false, resposta: null };
    if (!convidado) {
      // Classificação barata primeiro: só roda o agente completo se houver
      // indício de ação. Conversa pura vai direto pro chat.
      const intencao = await classificarIntencao(promptTruncado, signal);
      if (intencao === "acao") {
        decisao = await opencode.decidir(promptTruncado);
      }
    }
    if (decisao.erro) {
      return "A ação está demorando mais que o limite. Não vou repeti-la para evitar executar duas vezes; confira se ela terminou e me diga se quer tentar de novo.";
    }
    if (decisao.acao && decisao.resposta) {
      user.historico.push({ user: userInput, bot: decisao.resposta.slice(0, 500) });
      if (user.historico.length > 200) user.historico.shift();
      await db.write();
      log("INFO", "Ação executada pelo OpenCode", { usuario: username, chars: decisao.resposta.length });
      return decisao.resposta.slice(0, 4000);
    }

    let userMsg = `${historicoTxt}${memoriasTxt ? memoriasTxt + "\n\n" : ""}Usuário: ${promptTruncado}`;

    const imageUrls = (Array.isArray(imageUrl) ? imageUrl : imageUrl ? [imageUrl] : []).slice(0, 4);
    if (imageUrls.length) {
      if (typeof onProgress === "function") onProgress("Analisando imagem...", "🖼️");
      const contextosImagem = await Promise.all(imageUrls.map((url) => visaoDaImagem(url)));
      const descricoes = contextosImagem.map((descricao, i) => descricao && `[ANEXO ${i + 1}]\n${descricao}`).filter(Boolean);
      if (descricoes.length) {
        userMsg += `\n\n[IMAGENS/GIFS ENVIADOS PELO USUÁRIO]\n${descricoes.join("\n\n")}\n[FIM DOS ANEXOS]`;
        log("INFO", "[VISAO] Anexos analisados", { usuario: username, quantidade: descricoes.length });
      }
    }

    if (typeof onProgress === "function") onProgress("Pensando...", "💭");
    let resposta = await chamarLLM(sistema, userMsg, !convidado, { signal });

    if (isOwner(userId) && skills.respostaIndicaFalta && skills.respostaIndicaFalta(resposta)) {
      if (typeof onProgress === "function") onProgress("Vivendo e Aprendendo...", "🧠");
      const skill = await skills.aprenderExecutavel(promptTruncado, resposta);
      if (skill) {
        require("./resolucao").marcar(userId, "skill nova");
        const mod = skills.carregarModuloSkill(skill.id);
        if (mod && typeof mod.executar === "function") {
          try {
            const resultado = await mod.executar(promptTruncado);
            resposta = String(resultado || "").slice(0, 4000);
          } catch (err) {
            log("WARN", "[SKILLS] Erro ao executar skill recém-criada", { erro: err.message });
            resposta = await chamarLLM(`${sistema}\n\nSKILL RECÉM-ATIVADA:\n- ${skill.nome}: Aprendi a fazer isso! Pode me perguntar novamente.`, userMsg, true, { signal });
          }
        } else {
          resposta = await chamarLLM(`${sistema}\n\nSKILL RECÉM-ATIVADA:\n- ${skill.nome}: ${skill.descricao}`, userMsg, true, { signal });
        }
      }
    }

    for (let iter = 0; !convidado && iter < MAX_ITERACOES_FERRAMENTAS; iter++) {
      const ferramentas = toolsMod.extrairFerramentas(resposta || "");
      if (!ferramentas.length) break;

      const resultados = [];
      for (const f of ferramentas) {
        if (signal?.aborted) throw signal.reason || new Error("Processamento cancelado");
        if (typeof onProgress === "function") onProgress(`Executando ${f.nome}${f.args ? ` (${f.args})` : ""}...`, "🛠️");
        const res = await toolsMod.executarFerramenta(f);
        resultados.push(`FERRAMENTA: ${f.nome}${f.args ? ` | ${f.args}` : ""}\nRESULTADO:\n${String(res).slice(0, 1500)}`);
      }

      userMsg = `${historicoTxt}Usuário: ${promptTruncado}

${resposta}

--- Resultados das ferramentas ---
${resultados.join("\n\n")}

Agora responda ao usuário naturalmente com base nesses resultados. Se precisar de mais alguma ação, use FERRAMENTA: novamente. Se já resolveu, responda em texto normal, sem FERRAMENTA.`;

      resposta = await chamarLLM(sistema, userMsg, !convidado, { signal });
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
    if (err?.abortado) {
      log("INFO", "[AI] Processamento abortado pelo dono", { usuario: username });
      return "🛑 Beleza, chefe, parei. 🙂";
    }
    log("ERROR", "Falha", { erro: err.message });
    return "❌ Erro interno.";
  } finally {
    if (atrasoTimer) clearTimeout(atrasoTimer);
  }
}

async function visaoDaImagem(imageUrl) {
  try {
    const { data, headers } = await axios.get(imageUrl, { timeout: 15000, responseType: "arraybuffer", maxContentLength: 20 * 1024 * 1024 });
    const contentType = String(headers?.["content-type"] || "").split(";")[0].toLowerCase();
    const extensao = String(imageUrl).match(/\.(gif|png|jpe?g|webp)(?:[?#]|$)/i)?.[1]?.toLowerCase();
    const mime = contentType.startsWith("image/")
      ? contentType
      : extensao ? `image/${extensao === "jpg" ? "jpeg" : extensao}` : "image/png";
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

module.exports = { askNeon, chamarLLM, classificarIntencao };
