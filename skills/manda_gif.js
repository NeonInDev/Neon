const axios = require('axios');

const GIPHY_KEY = 'dc6zaTOxFJmzC';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function buscarTenorScrape(queryText) {
  const { data } = await axios.get(`https://tenor.com/search/${encodeURIComponent(queryText)}-gifs`, {
    timeout: 12000,
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
  });
  const urls = (data.match(/https:\/\/media\.tenor\.com\/[^"'\\s]+?\.gif/g) || [])
    .map((u) => u.replace(/^https:\/\//, 'https://'))
    .filter(Boolean);
  const unicas = [...new Set(urls)];
  return unicas.slice(0, 6);
}

async function buscarGiphy(queryText) {
  const { data } = await axios.get('https://api.giphy.com/v1/gifs/search', {
    params: { api_key: GIPHY_KEY, q: queryText, limit: 6, lang: 'pt' },
    timeout: 12000,
    headers: { 'User-Agent': UA },
  });
  return (data.data || []).map((g) => g.images?.original?.url).filter(Boolean);
}

async function urlValidaGif(url) {
  try {
    const r = await axios.head(url, { timeout: 10000, maxRedirects: 5, headers: { 'User-Agent': UA } });
    const tipo = String(r.headers['content-type'] || '');
    return r.status === 200 && /image\/(gif|webp)/.test(tipo);
  } catch (e) {
    try {
      const r = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': UA }, responseType: 'stream', maxContentLength: 5000000, maxRedirects: 5 });
      const tipo = String(r.headers['content-type'] || '');
      r.data.destroy();
      return r.status === 200 && /image\/(gif|webp)/.test(tipo);
    } catch {
      return false;
    }
  }
}

module.exports = {
  nome: 'manda_gif',
  descricao: 'Busca e retorna um GIF animado por palavra-chave (Tenor, com fallback GIPHY). Uso: skill_manda_gif | [assunto do gif]',
  executar: async (args) => {
    let busca;
    if (typeof args === 'string' && args.trim()) {
      busca = args.trim();
    } else if (args && typeof args === 'object') {
      busca = String(args.busca || args.tema || args.gif || args.assunto || "").trim();
    }
    busca = (busca || "").replace(/[<>]/g, "");
    if (!busca) return '❌ Informe o que o GIF deve mostrar. Ex.: skill_manda_gif | gato dançando';

    let candidatas = [];
    try { candidatas = await buscarTenorScrape(busca); } catch {}
    if (!candidatas.length) {
      try { candidatas = await buscarGiphy(busca); } catch {}
    }

    for (const url of candidatas) {
      if (await urlValidaGif(url)) return url;
    }

    return `❌ Não achei um GIF pra "${busca}" (Tenor e GIPHY indisponíveis). Tenta de novo daqui a pouco.`;
  }
};