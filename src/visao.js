const axios = require("axios");
const { log } = require("./logger");
const { GEMINI_API_KEY, GEMINI_MODEL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL } = require("./config");

function dataUrlDe(base64, mime = "image/png") {
  return base64.startsWith("data:") ? base64 : `data:${mime};base64,${base64}`;
}

async function analisarComGemini(prompt, dataUrl, timeoutMs = 60000) {
  if (!GEMINI_API_KEY) return null;
  const mime = dataUrl.match(/^data:([^;,]+)/i)?.[1] || "image/png";
  const resp = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mime, data: dataUrl.split(",")[1] } },
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
  const entrada = String(base64 || "");
  const dataUrlMime = entrada.match(/^data:([^;,]+)/i)?.[1];
  const payload = entrada.startsWith("data:") ? entrada.slice(entrada.indexOf(",") + 1) : entrada;
  let imagem = Buffer.from(payload, "base64");
  let tipoImagem = dataUrlMime || mime;
  let promptAnalise = prompt;
  if (String(tipoImagem).toLowerCase().split(";")[0] === "image/gif") {
    try {
      const sharp = require("sharp");
      const metadata = await sharp(imagem, { animated: true }).metadata();
      const paginas = Math.max(1, Number(metadata.pages) || 1);
      const quantidade = Math.min(6, paginas);
      const indices = Array.from({ length: quantidade }, (_, i) =>
        quantidade === 1 ? 0 : Math.round((i * (paginas - 1)) / (quantidade - 1))
      );
      const quadros = await Promise.all(indices.map((page) =>
        sharp(imagem, { page, pages: 1 })
          .resize({ width: 360, height: 240, fit: "inside", background: "white" })
          .png()
          .toBuffer()
      ));
      imagem = await sharp({
        create: {
          width: 360 * quadros.length,
          height: 240,
          channels: 3,
          background: "white",
        },
      }).composite(quadros.map((input, i) => ({ input, left: i * 360, top: 0 })))
        .jpeg({ quality: 82 })
        .toBuffer();
      tipoImagem = "image/jpeg";
      promptAnalise += "\nA imagem enviada é uma sequência de quadros de um GIF, organizados da esquerda para a direita. Descreva o movimento e a ordem dos acontecimentos.";
    } catch (err) {
      log("WARN", "[VISAO] Não consegui extrair quadros do GIF", { erro: err.message?.slice(0, 120) });
    }
  }
  const dataUrl = dataUrlDe(imagem.toString("base64"), tipoImagem);
  try {
    const gemini = await analisarComGemini(promptAnalise, dataUrl);
    if (gemini) return { descricao: gemini, modelo: "gemini" };
    log("WARN", "[VISAO] Gemini não respondeu, tentando DeepSeek");
  } catch (err) {
    log("WARN", "[VISAO] Gemini falhou, tentando DeepSeek", { erro: err.message?.slice(0, 100) });
  }
  try {
    const ds = await analisarComDeepSeek(promptAnalise, dataUrl);
    if (ds) return { descricao: ds, modelo: "deepseek" };
  } catch (err) {
    return { erro: `Falha na análise da imagem: ${err.message}` };
  }
  return { erro: "Nenhum modelo de visão respondeu" };
}

module.exports = { analisarImagem, analisarComGemini, analisarComDeepSeek, dataUrlDe };
