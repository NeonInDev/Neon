const axios = require("axios");
const { log } = require("./logger");
const {
  DEEPSEEK_API_KEY, DEEPSEEK_MODEL,
  GROQ_API_KEY, GROQ_MODEL,
  OMNIROUTE_API_KEY, OMNIROUTE_BASE_URL, OMNIROUTE_MODEL,
  OPENROUTER_API_KEY, OPENROUTER_MODEL,
} = require("./config");

const DEFINICOES = [
  { nome: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", key: GROQ_API_KEY, model: GROQ_MODEL, ms: 20000 },
  { nome: "OmniRoute", url: `${OMNIROUTE_BASE_URL}/chat/completions`, key: OMNIROUTE_API_KEY, model: OMNIROUTE_MODEL, ms: 30000 },
  { nome: "OpenRouter", url: "https://openrouter.ai/api/v1/chat/completions", key: OPENROUTER_API_KEY, model: OPENROUTER_MODEL, ms: 25000 },
  { nome: "DeepSeek", url: "https://api.deepseek.com/chat/completions", key: DEEPSEEK_API_KEY, model: DEEPSEEK_MODEL || "deepseek-chat", ms: 30000 },
].filter((p) => p.key);

const estado = {};
let timer = null;

async function testarUm(p) {
  const t0 = Date.now();
  try {
    await axios.post(
      p.url,
      {
        model: p.model,
        messages: [{ role: "user", content: "diga apenas: ok" }],
        max_tokens: 5,
        temperature: 0,
      },
      { headers: { Authorization: `Bearer ${p.key}` }, timeout: p.ms }
    );
    estado[p.nome] = { ok: true, latencia: Date.now() - t0, erro: null, ts: Date.now() };
  } catch (err) {
    estado[p.nome] = {
      ok: false,
      latencia: Date.now() - t0,
      erro: err.response
        ? `${err.response.status} ${JSON.stringify(err.response.data).slice(0, 120)}`
        : err.message,
      ts: Date.now(),
    };
  }
}

async function checar() {
  await Promise.all(DEFINICOES.map(testarUm));
  const resumo = {};
  for (const p of DEFINICOES) resumo[p.nome] = estado[p.nome]?.ok || false;
  log("INFO", "[SAUDE] APIs verificadas", { resumo });
  return status();
}

function status() {
  return {
    ts: Date.now(),
    intervaloMs: 5 * 60 * 1000,
    provedores: DEFINICOES.map((p) => estado[p.nome] || { ok: null, latencia: null, erro: "nunca testado", ts: null }),
  };
}

function iniciar(intervaloMs = 5 * 60 * 1000) {
  if (timer) return;
  checar().catch(() => {});
  timer = setInterval(() => checar().catch(() => {}), intervaloMs);
  if (timer.unref) timer.unref();
}

module.exports = { checar, status, iniciar };