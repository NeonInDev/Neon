const axios = require("axios");

const langMap = {
  pt: "pt", portugues: "pt", português: "pt",
  en: "en", ingles: "en", inglês: "en", english: "en",
  es: "es", espanhol: "es", spanish: "es",
  fr: "fr", frances: "fr", francês: "fr", french: "fr",
  de: "de", alemao: "de", alemão: "de", german: "de",
  it: "it", italiano: "it", italian: "it",
  ja: "ja", japones: "ja", japonês: "ja", japanese: "ja",
  ru: "ru", russo: "ru", russian: "ru",
};

function detectarIdioma(texto) {
  // Se tem caracteres portugueses, assume PT → EN
  if (/[ãáàâéêíóôõúç]/i.test(texto)) return "pt";
  return "en";
}

async function traduzir(texto, alvoRaw = "", origemRaw = "") {
  const alvo = langMap[alvoRaw.toLowerCase()] || alvoRaw || "pt";
  const origem = langMap[origemRaw.toLowerCase()] || origemRaw || detectarIdioma(texto);

  const { data } = await axios.get("https://api.mymemory.translated.net/get", {
    params: { q: texto, langpair: `${origem}|${alvo}` },
    timeout: 10000,
  });

  if (data?.responseData?.translatedText) {
    return data.responseData.translatedText;
  }
  throw new Error("Tradução falhou");
}

module.exports = { traduzir };
