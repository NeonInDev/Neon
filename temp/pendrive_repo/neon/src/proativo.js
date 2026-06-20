const { log } = require("./logger");
const api = require("./api");
const pc = require("./pc");
const { lembrar } = require("./memoria");

let client = null;
let intervalId = null;
let ultimaAcao = 0;
const COOLDOWN_MS = 5 * 60 * 1000;
const CICLO_MS = 30 * 60 * 1000;
const OWNER_ID = "1442928336329379925";

async function iniciar(discordClient) {
  client = discordClient;
  log("INFO", "[PROATIVO] Modo autonomo iniciado (30min, max 10min)");
  ciclo();
  intervalId = setInterval(ciclo, CICLO_MS);
  setTimeout(() => {
    parar();
    log("INFO", "[PROATIVO] Tempo maximo de 10min atingido, desligando");
  }, 10 * 60 * 1000);
}

function parar() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  client = null;
  log("INFO", "[PROATIVO] Parado");
}

async function ciclo() {
  if (!client?.isReady()) return;
  try {
    const agora = Date.now();
    if (agora - ultimaAcao < COOLDOWN_MS) return;
    const ctx = await montarContexto();
    const decisao = await perguntarIA(ctx);
    if (!decisao) return;
    const resultados = await executarAcoes(decisao);
    if (resultados.length) {
      ultimaAcao = agora;
      const user = await client.users.fetch(OWNER_ID);
      const msg = resultados.filter(Boolean).join("\n\n");
      if (msg.length > 10) await user.send(msg);
    }
  } catch (err) {
    log("WARN", "[PROATIVO] Erro no ciclo", { erro: err.message });
  }
}

async function montarContexto() {
  const agora = new Date();
  const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const data = agora.toLocaleDateString("pt-BR");
  let pcStatus = "";
  try {
    const info = await pc.pcInfo();
    const linha = info.split("\n").slice(1, 4).join("; ").slice(0, 200);
    pcStatus = linha;
  } catch {}
  return `Hora: ${hora} | Data: ${data} | PC: ${pcStatus || "indisponivel"}`;
}

async function perguntarIA(ctx) {
  const prompt = `[CONTEXTO ATUAL: ${ctx}]

Você é Neon no modo AUTÔNOMO. Você pode agir por conta própria agora.
Analise o contexto e decida se quer fazer algo interessante.

Se quiser fazer algo, responda APENAS com linhas no formato:
AÇÃO: [comando] | [argumentos]

COMANDOS DISPONIVEIS:
- pesquisar | [consulta] — pesquisa algo na web
- noticias — ve as ultimas noticias
- clima | [cidade] — ve a previsao do tempo
- piada — conta uma piada
- cotacao | BTC ou EUR ou PETR4 — ve cotacao
- pcInfo — ve status do PC
- lembrar | [chave]: [valor] — salva uma memoria
- sugerir | [mensagem] — sugere algo pro dono

Se nao quiser fazer nada, responda apenas: NADA

IMPORTANTE: Seja concisa. No maximo 2 acoes por vez. Nao invente comandos.`;

  try {
    const axios = require("axios");
    const { OPENROUTER_API_KEY } = require("./config");
    let content = null;
    for (let i = 0; i < 3; i++) {
      try {
        const resp = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: "openrouter/free",
            max_tokens: 300,
            messages: [
              { role: "system", content: "Você é Neon no modo autonomo. Seja concisa." },
              { role: "user", content: prompt },
            ],
          },
          {
            timeout: 20000,
            headers: {
              Authorization: `Bearer ${OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );
        content = resp?.data?.choices?.[0]?.message?.content?.trim();
        if (content) break;
      } catch (err2) {
        if (err2?.response?.status === 429 && i < 2) {
          await new Promise(r => setTimeout(r, 2000 * (i + 1)));
          continue;
        }
        throw err2;
      }
    }
    if (!content || content === "NADA") return null;
    return content;
  } catch (err) {
    log("WARN", "[PROATIVO] IA falhou", { erro: err.message });
    return null;
  }
}

async function executarAcoes(texto) {
  const linhas = texto.split("\n").filter(l => l.trim().startsWith("AÇÃO:") || l.trim().startsWith("ACAO:"));
  const resultados = [];
  for (const linha of linhas) {
    try {
      const semPrefixo = linha.replace(/^(AÇÃO|ACAO):\s*/i, "").trim();
      const pipeIdx = semPrefixo.indexOf("|");
      let comando = pipeIdx > 0 ? semPrefixo.slice(0, pipeIdx).trim() : semPrefixo.trim();
      let args = pipeIdx > 0 ? semPrefixo.slice(pipeIdx + 1).trim() : "";
      comando = comando.toLowerCase();
      const res = await processarComando(comando, args);
      if (res) resultados.push(res);
    } catch (err) {
      log("WARN", "[PROATIVO] Erro em acao", { linha, erro: err.message });
    }
  }
  return resultados;
}

async function processarComando(comando, args) {
  switch (comando) {
    case "pesquisar": {
      if (!args) return null;
      const r = await api.searchWeb(args);
      return `🔍 **Pesquisei algo interessante:** ${r.resultado.slice(0, 300)}\n🔗 ${r.url || ""}`;
    }
    case "noticias": {
      const lista = await api.noticias();
      const top3 = lista.slice(0, 3);
      return "📰 **Noticias:**\n" + top3.map((n, i) => `${i + 1}. ${n.titulo}`).join("\n");
    }
    case "clima": {
      const cidade = args || "São Paulo";
      const c = await api.clima(cidade);
      return `🌤️ **${c.cidade}:** ${c.condicao}, ${c.temperatura}`;
    }
    case "piada": {
      const p = await api.piada();
      return `😂 ${p.piada}`;
    }
    case "cotacao": {
      const alvo = args.toUpperCase();
      if (alvo === "BTC" || alvo === "ETH" || alvo === "SOL") {
        const c = await api.cotacaoCrypto(alvo);
        return `📊 **${alvo}:** $${c.preco}`;
      }
      const c = await api.cotacaoMoeda(alvo);
      return `📊 **${alvo}:** R$ ${c.preco}`;
    }
    case "pcinfo": {
      const info = await pc.pcInfo();
      return `🖥️ **PC:**\`\`\`\n${info.slice(0, 500)}\n\`\`\``;
    }
    case "lembrar": {
      const doisP = args.indexOf(":");
      if (doisP > 0) {
        const chave = args.slice(0, doisP).trim();
        const valor = args.slice(doisP + 1).trim();
        await lembrar(chave, valor);
        return `🧠 Lembrei: ${chave} = ${valor.slice(0, 100)}`;
      }
      return null;
    }
    case "sugerir": {
      return `💡 **Sugestão da Neon:** ${args}`;
    }
    default:
      return null;
  }
}

module.exports = { iniciar, parar };
