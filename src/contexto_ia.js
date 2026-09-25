// =============================================================
// VERIFICADOR DE CONTEXTO (IA) - roda ANTES de punir
// -------------------------------------------------------------
// O filtro de palavras e burro por natureza: ele casa "preto" em
// "cabelo preto" e "macaco" em "a prova de macaco e linda". Aqui a
// Neon le a frase inteira e decide se o uso e mesmo uma ofensa ou
// um uso legitimo (RP, cor, zoeira entre amigos, anuncio de parceria).
//
// Retorna: { decisao: "ofensa" | "legitimo", razao, modelo }
//   decisao = null  -> a IA falhou / deu timeout (ver fallback na config)
// Regra do servidor: em canal de PARCERIA, texto de RP ou cor,
// a palavra raramente e uma ofensa dirigida a alguem.
// =============================================================
const axios = require("axios");
const { GROQ_API_KEY, GROQ_CLASSIFIER_MODEL } = require("./config");
const { log } = require("./logger");

const REGRAS = [
  "Voce e o verificador de contexto de uma automoderacao de Discord brasileiro.",
  "Voce recebe a mensagem que disparou um filtro automatico e decide se o uso",
  "do termo e realmente uma OFENSA dirigida a alguem, ou um uso legitimo.",
  "",
  'Responda SOMENTE com um JSON, sem texto em volta:',
  '{"decisao":"ofensa"|"legitimo","razao":"curto"}',
  "",
  "OFENSA quando:",
  "- o termo xinga, humilha, acusa ou invoca racismo ou violencia sexual",
  "- trata a pessoa de forma racista, ou compara a pessoa a um animal",
  "- e xingamento enderecado diretamente a alguem",
  "- o termo faz parte de um apelido/desgraço racial, ainda que dentro de outra palavra",
  "- o termo e um VARIANTE/ABREVIACAO de uma ofensa (ex: 'ngr', 'absd', 'strpd')",
  "- o uso NAO e cor, NAO e bicho, NAO e RP e NAO e referencia inocente",
  "- a pessoa esta xingando o outro, mesmo que com 'vc', 'ele', 'aquele' ou 'esse'",
  "- relatar ou citar a ofensa NAO inocenta: 'ele me chamou de X' continua sendo",
  "  o mesmo termo ofensivo aparecendo na conversa",
  "",
  "LEGITIMO quando:",
  "- descreve cor, roupa ou aparencia (cabelo preto, roupa preta, olhos negros,",
  "  preto e branco, noite negra, pele escura)",
  "- o termo vem de uma cor de roupa: 'roupa preta', 'vestido preto', 'meia preta',",
  "  'camiseta preta', 'jaqueta preta' -> SEMPRE e legitimo",
  "- e anuncio de parceria ou recrutamento de um servidor",
  "- e fala de roleplay ou ficcao (personagem, ficha, cena)",
  "- cita bicho, primata, fruta, carro, marca, poema ou letra de musica",
  "- e zoeira leve entre iguais, sem racializacao e sem violencia",
  "- o termo aparece isolado dentro de um texto longo e descritivo",
  "",
  "NA DUVIDA entre OFENSA e LEGITIMO, responda LEGITIMO.",
  "O filtro automatico e burro e ja avisou sobre a palavra: nao comecando a",
  "frase, tanto no inicio quanto no meio dela.",
  "",
].join("\n");

function extrairJson(txt) {
  if (!txt) return null;
  const limpo = String(txt).replace(/```json/gi, "").replace(/```/g, "").trim();
  const primeiro = limpo.indexOf("{");
  const ultimo = limpo.lastIndexOf("}");
  if (primeiro < 0 || ultimo <= primeiro) return null;
  try {
    return JSON.parse(limpo.slice(primeiro, ultimo + 1));
  } catch {
    return null;
  }
}

// cache curto: a mesma frase nao gasta IA duas vezes
const cache = new Map();
const CACHE_MS = 60 * 1000;

async function avaliarContexto({ texto, termo, filtro, canal, autor, ms = 8000 }) {
  if (!GROQ_API_KEY || !GROQ_CLASSIFIER_MODEL) return { decisao: null, razao: "sem chave de IA" };

  const chave = `${termo}|${canal}|${String(texto).slice(0, 300)}`;
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.em < CACHE_MS) {
    return { ...guardado.r, cache: true };
  }

  const corpo = String(texto || "").slice(0, 1200);
  const contexto = `Filtro que disparou: ${filtro || "palavra proibida"}\nCanal: ${canal || "?"}\nTermo casado: ${termo || "?"}\nMensagem: ${corpo}`;
  const prompt = `${REGRAS}\nContexto da mensagem:\n${contexto}\n\nJulga essa mensagem.`;

  try {
    const resp = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: GROQ_CLASSIFIER_MODEL,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `Mensagem de ${autor || "usuario"} no canal ${canal || "?"}: ${corpo}` },
        ],
        temperature: 0,
        max_tokens: 200,
        response_format: { type: "json_object" },
      },
      { headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, timeout: ms }
    );
    const obj = extrairJson(resp?.data?.choices?.[0]?.message?.content);
    if (!obj || !["ofensa", "legitimo"].includes(obj.decisao)) {
      return { decisao: null, razao: "resposta da IA fora do formato" };
    }
    const r = {
      decisao: obj.decisao,
      razao: String(obj.razao || "").slice(0, 200),
      modelo: GROQ_CLASSIFIER_MODEL,
    };
    cache.set(chave, { em: Date.now(), r });
    if (cache.size > 300) cache.clear();
    return r;
  } catch (err) {
    log("WARN", "[CONTEXTO] IA falhou", { erro: err.message?.slice(0, 120) });
    return { decisao: null, razao: err.message?.slice(0, 120) };
  }
}

module.exports = { avaliarContexto };
