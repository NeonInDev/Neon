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

module.exports = { cotacaoMoeda, cotacaoCrypto, clima, buscarCEP, definicao, fatoAleatorio, meuIP };