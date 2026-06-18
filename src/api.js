const axios = require("axios");

async function cotacaoMoeda() {
  const { data } = await axios.get("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,GBP-BRL,ARS-BRL", { timeout: 10000 });
  return {
    dolar: { compra: parseFloat(data.USDBRL.bid), variacao: parseFloat(data.USDBRL.pctChange) },
    euro: { compra: parseFloat(data.EURBRL.bid), variacao: parseFloat(data.EURBRL.pctChange) },
    libra: { compra: parseFloat(data.GBPBRL.bid), variacao: parseFloat(data.GBPBRL.pctChange) },
    peso: { compra: parseFloat(data.ARSBRL.bid), variacao: parseFloat(data.ARSBRL.pctChange) },
    data: data.USDBRL.create_date,
  };
}

async function cotacaoCrypto() {
  const { data } = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,cardano,ripple&vs_currencies=usd&include_24hr_change=true", { timeout: 10000 });
  return {
    bitcoin: { usd: data.bitcoin.usd, variacao24h: data.bitcoin.usd_24h_change },
    ethereum: { usd: data.ethereum.usd, variacao24h: data.ethereum.usd_24h_change },
    solana: { usd: data.solana.usd, variacao24h: data.solana.usd_24h_change },
  };
}

async function clima(cidade) {
  const { data } = await axios.get(`https://wttr.in/${encodeURIComponent(cidade)}?format=%C+%t+%h+%w&lang=pt`, { timeout: 10000 });
  const partes = data.trim().split(/\s+/);
  return { condicao: partes.slice(0, -3).join(" "), temperatura: partes[partes.length - 3], umidade: partes[partes.length - 2], vento: partes[partes.length - 1] };
}

async function buscarCEP(cep) {
  const { data } = await axios.get(`https://viacep.com.br/ws/${cep}/json/`, { timeout: 10000 });
  if (data.erro) throw new Error("CEP não encontrado");
  return { logradouro: data.logradouro, bairro: data.bairro, cidade: data.localidade, estado: data.uf, cep: data.cep };
}

async function definicao(palavra) {
  const { data } = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/pt/${encodeURIComponent(palavra)}`, { timeout: 10000 });
  const entry = data[0];
  return { palavra: entry.word, fonetica: entry.phonetic || "", definicoes: entry.meanings?.flatMap(m => m.definitions.map(d => ({ classe: m.partOfSpeech, definicao: d.definition, exemplo: d.example }))) || [] };
}

async function fatoAleatorio() {
  const { data } = await axios.get("https://catfact.ninja/fact", { timeout: 10000 });
  return { fato: data.fact };
}

async function meuIP() {
  const [ipRes, infoRes] = await Promise.allSettled([
    axios.get("https://api.ipify.org?format=json", { timeout: 10000 }),
    axios.get("https://ipinfo.io/json", { timeout: 10000 }),
  ]);
  const ip = ipRes.status === "fulfilled" ? ipRes.value.data.ip : "desconhecido";
  const info = infoRes.status === "fulfilled" ? infoRes.value.data : {};
  return { ip, pais: info.country || "?", cidade: info.city || "?", provedor: info.org || info.isp || "?" };
}

async function gerarImagem(prompt) {
  // Usa Pollinations.ai (gratis, sem chave, retorna imagem direto)
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${Date.now()}&nofeed=true`;
  // Verifica se a URL responde
  try {
    await axios.head(url, { timeout: 5000 });
  } catch {
    // Se HEAD falhar, tenta GET parcial
    try {
      await axios.get(url, { timeout: 8000, responseType: "stream", maxContentLength: 1024 });
    } catch {
      throw new Error("Não foi possível gerar a imagem");
    }
  }
  return url;
}

async function buscarImagem(query) {
  // Tenta IA encontrar uma URL de imagem real para a query
  try {
    const { OPENROUTER_API_KEY } = require("./config");
    const resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "google/gemini-2.0-flash-001",
        messages: [
          { role: "user", content: `Retorne APENAS a URL direta de uma imagem real (jpg/png/gif) relevante para "${query}". NÃO explique, só a URL.` }
        ],
        max_tokens: 200,
      },
      {
        timeout: 20000,
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    const content = resp?.data?.choices?.[0]?.message?.content?.trim();
    if (content && /^https?:\/\//.test(content)) return content;
  } catch {}
  // Fallback: gera uma imagem tematica com o prompt como seed
  const seed = encodeURIComponent(query.replace(/\s+/g, "-"));
  return `https://picsum.photos/seed/${seed}/800/600`;
}

async function imagemAleatoria(tipo) {
  const apis = {
    gato: "https://api.thecatapi.com/v1/images/search",
    cachorro: "https://dog.ceo/api/breeds/image/random",
    paisagem: "https://picsum.photos/800/600",
    aleatorio: "https://picsum.photos/800/600",
  };
  const url = apis[tipo] || apis.aleatorio;
  const { data } = await axios.get(url, { timeout: 10000, maxRedirects: 0, validateStatus: s => s < 400 });
  if (typeof data === "string") return data; // picsum redirects
  if (data?.[0]?.url) return data[0].url; // thecatapi
  if (data?.message) return data.message; // dog.ceo
  if (data?.url) return data.url;
  throw new Error("Não consegui buscar imagem");
}

module.exports = { cotacaoMoeda, cotacaoCrypto, clima, buscarCEP, definicao, fatoAleatorio, meuIP, gerarImagem, buscarImagem, imagemAleatoria };