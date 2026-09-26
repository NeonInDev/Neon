I don't have reliable information on this specific person, so the module should fetch live data rather than hardcode a guess.

const https = require('https');
const zlib = require('zlib');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const enc = (res.headers['content-encoding'] || '').toLowerCase();
      let stream = res;
      if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
      else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
      let data = '';
      stream.setEncoding('utf8');
      stream.on('data', (c) => (data += c));
      stream.on('end', () => resolve(data));
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

function plain(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n))
    .replace(/\s+/g, ' ')
    .trim();
}

function around(html, name, max) {
  const txt = plain(html);
  const low = txt.toLowerCase();
  const terms = name.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  for (const term of terms) {
    let i = low.indexOf(term);
    while (i !== -1) {
      const start = Math.max(0, i - 220);
      const end = Math.min(txt.length, i + term.length + 420);
      const chunk = txt.slice(start, end);
      if (chunk.split(' ').length > 25) return chunk;
      i = low.indexOf(term, i + 1);
    }
  }
  return txt.slice(0, max || 700);
}

async function wiki(name) {
  const url = 'https://pt.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=extracts&exintro=1&explaintext=1&titles=' + encodeURIComponent(name);
  const raw = await get(url);
  const data = JSON.parse(raw);
  const pages = data.query && data.query.pages;
  if (!pages) throw new Error('sem dados');
  for (const k of Object.keys(pages)) {
    const p = pages[k];
    if (p.extract && p.extract.trim().length > 40 && p.missing === undefined) return p.extract.trim();
  }
  throw new Error('sem verbete');
}

module.exports = {
  nome: 'quem-e',
  descricao: 'Responde "quem é X?" buscando uma biografia resumida na Wikipédia e, em caso de falha, em mecanismos de busca e no próprio navegador. Ex: quem é donni berger',

  async executar(args) {
    const raw = (Array.isArray(args) ? args.join(' ') : String(args == null ? '' : args)) || '';
    let q = raw.trim();
    q = q.replace(/^\s*(quem\s+[eé]o?\s+|quem\s+foi\s+|fale\s+sobre\s+|me\s+fale\s+sobre\s+|conta\s+sobre\s+|who\s+is\s+)/i, '');
    q = q.replace(/[\s?.!]+$/, '').trim();

    if (q.length < 2) {
      return 'Informe o nome de quem você quer descobrir. Ex.: quem e donni berger';
    }

    const partes = [];

    try {
      const bio = await wiki(q);
      partes.push('📖 ' + bio.split(/(?<=\.)\s/)[0].slice(0, 500));
    } catch (e) {
      try {
        partes.push('📖 ' + (await wiki(q + ' (desambiguação)')).slice(0, 400));
      } catch (e2) {
        partes.push('📖 Sem verbete confiável na Wikipédia sobre "' + q + '".');
      }
    }

    try {
      const html = await get('htt