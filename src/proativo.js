const { log } = require("./logger");
const api = require("./api");
const pc = require("./pc");
const { lembrar } = require("./memoria");
const axios = require("axios");
const { DEEPSEEK_API_KEY, DEEPSEEK_MODEL } = require("./config");
const { OWNER } = require("./perm");

let client = null;
let intervalId = null;
let ultimaAcao = 0;
let cicloCount = 0;
const COOLDOWN_MS = 3 * 60 * 1000;
const CICLO_MS = 15 * 60 * 1000;
const OWNER_ID = OWNER;

async function iniciar(discordClient) {
  client = discordClient;
  ultimaAcao = Date.now();
  cicloCount = 0;
  log("INFO", "[PROATIVO] Modo Jarvis iniciado (ciclo a cada 15min)");
  await ciclo();
  intervalId = setInterval(ciclo, CICLO_MS);
}

function parar() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  client = null;
  log("INFO", "[PROATIVO] Modo Jarvis desativado");
}

function isRunning() {
  return intervalId !== null && client !== null;
}

async function toggle(discordClient) {
  if (isRunning()) {
    parar();
    return "🤖 Modo Jarvis desativado.";
  } else {
    await iniciar(discordClient);
    return "🤖 Modo Jarvis ativado! Neon está monitorando o PC e agindo por conta própria.";
  }
}

async function enviarMensagem(texto) {
  try {
    const user = await client.users.fetch(OWNER_ID);
    await user.send(texto);
    return true;
  } catch {
    log("WARN", "[PROATIVO] Falha ao enviar DM");
    return false;
  }
}

async function ciclo() {
  if (!client?.isReady()) return;
  cicloCount++;
  try {
    const contexto = await montarContexto();

    const alertas = await verificarEmergencias();
    if (alertas.length > 0) {
      ultimaAcao = Date.now();
      await enviarMensagem("🚨 **Neon - Alerta**\n" + alertas.join("\n"));
    }

    if (cicloCount % 3 === 0) {
      const agora = Date.now();
      if (agora - ultimaAcao >= COOLDOWN_MS) {
        const decisao = await perguntarIA(contexto);
        if (decisao) {
          const resultados = await executarAcoes(decisao);
          if (resultados.length > 0) {
            ultimaAcao = agora;
            await enviarMensagem("🤖 **Neon - Modo Jarvis**\n" + resultados.filter(Boolean).join("\n\n"));
          }
        }
      }
    }

    log("INFO", `[PROATIVO] Ciclo #${cicloCount} OK`, { alertas: alertas.length });
  } catch (err) {
    log("WARN", "[PROATIVO] Erro no ciclo", { erro: err.message });
  }
}

async function montarContexto() {
  const agora = new Date();
  const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const data = agora.toLocaleDateString("pt-BR");
  const diaSemana = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"][agora.getDay()];
  const pcInfo = await pc.pcInfoJson().catch(() => null);

  let ctx = `Hora: ${hora} | Data: ${data} (${diaSemana})`;

  if (pcInfo) {
    ctx += ` | CPU: ${pcInfo.cpuUso || "?"}% | RAM: ${pcInfo.ramUso || "?"}%`;
    if (pcInfo.temperatura) ctx += ` | Temp: ${pcInfo.temperatura}°C`;
    if (pcInfo.temperaturaGpu) ctx += ` | GPU: ${pcInfo.temperaturaGpu}°C`;
    if (pcInfo.discoUso) ctx += ` | Disco: ${pcInfo.discoUso}%`;
    ultimaAcao = Date.now();
  }

  const horaNum = agora.getHours();
  if (horaNum >= 6 && horaNum < 12) ctx += " | Periodo: manha";
  else if (horaNum >= 12 && horaNum < 18) ctx += " | Periodo: tarde";
  else ctx += " | Periodo: noite";

  return ctx;
}

async function verificarEmergencias() {
  const alertas = [];
  try {
    const info = await pc.pcInfoJson();
    if (info) {
      if (info.ramUso > 90) alertas.push(`⚠️ RAM em ${info.ramUso}% — talvez seja bom fechar uns programas.`);
      if (info.cpuUso > 90) alertas.push(`⚠️ CPU em ${info.cpuUso}% — algo ta pesado.`);
      if (info.discoUso > 95) alertas.push(`⚠️ Disco quase cheio (${info.discoUso}%).`);
      if (info.temperatura && info.temperatura > 85) alertas.push(`🔥 Temperatura em ${info.temperatura}°C — PC ta esquentando!`);
      if (info.temperaturaGpu && info.temperaturaGpu > 85) alertas.push(`🔥 GPU em ${info.temperaturaGpu}°C — ta esquentando!`);
    }
  } catch {}

  try {
    const bat = await pc.bateria();
    if (bat) {
      const nivelMatch = bat.match(/Nivel:\s*(\d+)%/);
      if (nivelMatch) {
        const nivel = parseInt(nivelMatch[1]);
        if (nivel < 20 && bat.includes("Descarregando")) {
          alertas.push(`🔋 Bateria em ${nivel}% — melhor plugar o carregador!`);
        }
      }
    }
  } catch {}

  return alertas;
}

async function chamarDeepSeek(messages, maxTokens = 400, timeout = 20000) {
  for (let i = 0; i < 3; i++) {
    try {
      const resp = await axios.post(
        "https://api.deepseek.com/v1/chat/completions",
        { model: DEEPSEEK_MODEL, max_tokens: maxTokens, messages },
        { timeout, headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" } }
      );
      return resp?.data?.choices?.[0]?.message?.content?.trim();
    } catch (err) {
      log("WARN", `DeepSeek tentativa ${i + 1}/3 falhou`, { erro: err.response?.status || err.message });
      if (i < 2) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  return null;
}

async function perguntarIA(ctx) {
  const prompt = `[CONTEXTO ATUAL: ${ctx}]

Você é a Neon — uma IA autônoma que monitora o PC do dono. Não tem "modos"; é sempre você.
Use o contexto acima para decidir se quer fazer algo util.

Exemplos de coisas que voce pode fazer:
- Pesquisar algo interessante baseado no horario (noticias da manha, clima)
- Sugerir algo pro dono (fazer pausa, beber agua, dormir se for tarde)
- Contar uma piada se estiver de noite e o PC tiver parado
- Lembrar de algo que o dono pediu
- Ver cotacao se for horario de mercado

COMANDOS DISPONIVEIS (responda com linhas AÇÃO: comando | args):
- pesquisar | [consulta]
- noticias
- clima | [cidade]
- piada
- cotacao | BTC ou EUR ou PETR4
- pcInfo
- lembrar | [chave]: [valor]
- sugerir | [mensagem para o dono]

Se nao quiser fazer nada, responda apenas: NADA

IMPORTANTE: No maximo 2 acoes. Seja util, nao invente comandos.`;

  try {
    const messages = [
      { role: "system", content: "Você é Neon. Personalidade: útil, observadora, às vezes engraçada, saca piada e referência. Respostas curtas." },
      { role: "user", content: prompt },
    ];
    const content = await chamarDeepSeek(messages);
    if (!content || content.trim() === "NADA") return null;
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
      return `🔍 **Pesquisei:** ${r.resultado.slice(0, 300)}\n🔗 ${r.url || ""}`;
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
      return await api.cotacao(args);
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

module.exports = { iniciar, parar, isRunning, toggle };
