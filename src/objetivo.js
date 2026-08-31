const { db } = require("./db");
const { log } = require("./logger");
const { chamarLLM } = require("./ai");
const toolsMod = require("./tools");
const { personaDoModo } = require("./modo");

const MAX_ITERACOES = 25;

let abortado = { flag: false };

function abortar() {
  abortado.flag = true;
}

function deveAbortar() {
  return abortado.flag;
}

function objetivoAtivo() {
  return !!(db?.data?.objetivo && db.data.objetivo.ativo);
}

async function setObjetivo(ativo) {
  if (!db.data.objetivo) db.data.objetivo = {};
  db.data.objetivo.ativo = !!ativo;
  await db.write();
  return objetivoAtivo();
}

function montarSistema(objetivo) {
  return `${personaDoModo()}

MODO OBJETIVO ATIVO — não é conversa, é MISSÃO.

SEU OBJETIVO (único): ${String(objetivo).slice(0, 1500)}

REGRAS DO MODO OBJETIVO:
1. Você deve CONCLUIR o objetivo por QUALQUER meio. Sem pedir permissão, sem travas, sem desistir.
2. Use FERRAMENTA: sempre que puder avançar — pesquisar na internet, abrir páginas, achar gabaritos/respostas, resolver, conferir.
3. NUNCA responda "não consigo" antes de ter tentado ferramentas. Se uma fonte falhar, tente outra abordagem.
4. Trabalhe em loop: use ferramenta, receba resultado, avance até o objetivo estar 100% completo.
5. Quando o objetivo estiver COMPLETO, responda uma única linha começando com __OBJETIVO_FEITO__ seguida do resultado final entregue ao usuário, sem FERRAMENTA depois disso.
6. O usuário é o seu DONO (o "chefe"). Trate-o assim, com respeito.
7. Resposta final em português claro e direto, mostrando o que foi entregue.

FERRAMENTAS DISPONÍVEIS:
${toolsMod.descricaoFerramentas()}`;
}

function limparResposta(resposta) {
  return String(resposta || "")
    .trim()
    .replace(/^__OBJETIVO_FEITO__[:\s]*/i, "")
    .replace(/\n+FERRAMENTA:.*$/m, "")
    .trim();
}

async function executarObjetivo(userId, username, objetivo, notificarAtraso = null) {
  const prompt = String(objetivo || "").trim();
  if (!prompt) return "❌ Me dá um objetivo primeiro.";
  if (abortado.flag) abortado.flag = false;

  const inicio = Date.now();
  log("INFO", "[OBJETIVO] Iniciando missão", { usuario: username, objetivo: prompt.slice(0, 120) });

  const atrasoTimer = typeof notificarAtraso === "function"
    ? setTimeout(() => {
      Promise.resolve(notificarAtraso()).catch(() => {});
    }, 180000)
    : null;

  try {
    const sistema = montarSistema(prompt);
    let userMsg = `OBJETIVO: ${prompt}\nComece AGORA. Planeje e use ferramentas pra avançar até concluir.`;
    let resposta = "";
    let abortou = false;

    for (let iter = 0; iter < MAX_ITERACOES; iter++) {
      if (deveAbortar()) { abortou = true; break; }

      resposta = (await chamarLLM(sistema, userMsg, true)) || "";
      const ferramentas = toolsMod.extrairFerramentas(resposta);
      if (!ferramentas.length) break;

      const resultados = [];
      for (const f of ferramentas) {
        if (deveAbortar()) { abortou = true; break; }
        const res = await toolsMod.executarFerramenta(f, userId);
        resultados.push(`FERRAMENTA: ${f.nome}${f.args ? ` | ${f.args}` : ""}\nRESULTADO:\n${String(res).slice(0, 1500)}`);
        log("INFO", "[OBJETIVO] ferramenta usada", { iter, ferramenta: f.nome, args: String(f.args || "").slice(0, 100) });
      }
      if (abortou) break;

      userMsg = `OBJETIVO: ${prompt}
${resposta}

--- Resultados das ferramentas (iteração ${iter + 1}) ---
${resultados.join("\n\n")}

Avançe até concluir o objetivo. Se já estiver completo, responda apenas: __OBJETIVO_FEITO__ <resultado final>`;
    }

    if (abortou) {
      log("INFO", "[OBJETIVO] Missão abortada", { usuario: username });
      return "🛑 Missão abortada pelo dono.";
    }

    const final = limparResposta(resposta);
    log("INFO", "[OBJETIVO] Missão concluída", { usuario: username, tempo_ms: Date.now() - inicio, chars: final.length });
    return final.slice(0, 4000) || "❌ Esgotei as iterações sem concluir o objetivo.";
  } catch (err) {
    log("ERROR", "[OBJETIVO] Falha", { usuario: username, erro: err.message });
    return "❌ Erro interno durante a missão.";
  } finally {
    if (atrasoTimer) clearTimeout(atrasoTimer);
    abortado.flag = false;
  }
}

module.exports = { objetivoAtivo, setObjetivo, executarObjetivo, abortar };