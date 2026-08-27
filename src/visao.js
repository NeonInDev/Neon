const axios = require("axios");
const { log } = require("./logger");
const { GEMINI_API_KEY, GEMINI_MODEL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL } = require("./config");

function dataUrlDe(base64, mime = "image/png") {
  return base64.startsWith("data:") ? base64 : `data:${mime};base64,${base64}`;
}

async function analisarComGemini(prompt, dataUrl, timeoutMs = 60000) {
  if (!GEMINI_API_KEY) return null;
  const resp = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: "image/png", data: dataUrl.split(",")[1] } },
        ],
      }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    },
    { timeout: timeoutMs }
  );
  const texto = resp?.data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n");
  return (texto && texto.trim()) || null;
}

async function analisarComDeepSeek(prompt, dataUrl, timeoutMs = 30000) {
  if (!DEEPSEEK_API_KEY) return null;
  const resp = await axios.post(
    "https://api.deepseek.com/chat/completions",
    {
      model: DEEPSEEK_MODEL,
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }],
    },
    { timeout: timeoutMs, headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" } }
  );
  const texto = resp?.data?.choices?.[0]?.message?.content;
  return (texto && texto.trim()) || null;
}

async function analisarImagem(base64, prompt = "Descreva detalhadamente o que você vê nesta imagem. Responda em português.", mime = "image/png") {
  const dataUrl = dataUrlDe(base64, mime);
  try {
    const gemini = await analisarComGemini(prompt, dataUrl);
    if (gemini) return { descricao: gemini, modelo: "gemini" };
    log("WARN", "[VISAO] Gemini não respondeu, tentando DeepSeek");
  } catch (err) {
    log("WARN", "[VISAO] Gemini falhou, tentando DeepSeek", { erro: err.message?.slice(0, 100) });
  }
  try {
    const ds = await analisarComDeepSeek(prompt, dataUrl);
    if (ds) return { descricao: ds, modelo: "deepseek" };
  } catch (err) {
    return { erro: `Falha na análise da imagem: ${err.message}` };
  }
  return { erro: "Nenhum modelo de visão respondeu" };
}

module.exports = { analisarImagem, analisarComGemini, analisarComDeepSeek, dataUrlDe };