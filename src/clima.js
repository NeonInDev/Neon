const axios = require("axios");
const { log } = require("./logger");

const CIDADE_PADRAO = process.env.CLIMA_CIDADE || "São Paulo";
const cache = new Map();
const TTL = 30 * 60 * 1000;

const WMO = {
  0: ["Céu limpo", "☀️"],
  1: ["Predominantemente limpo", "🌤️"],
  2: ["Parcialmente nublado", "⛅"],
  3: ["Nublado", "☁️"],
  45: ["Névoa", "🌫️"],
  48: ["Névoa com geada", "🌫️"],
  51: ["Garoa fraca", "🌦️"],
  53: ["Garoa moderada", "🌦️"],
  55: ["Garoa intensa", "🌧️"],
  56: ["Garoa congelante", "🌧️"],
  57: ["Garoa congelante forte", "🌧️"],
  61: ["Chuva fraca", "🌦️"],
  63: ["Chuva moderada", "🌧️"],
  65: ["Chuva forte", "⛈️"],
  66: ["Chuva congelante", "🌧️"],
  67: ["Chuva congelante forte", "🌧️"],
  71: ["Neve fraca", "🌨️"],
  73: ["Neve moderada", "🌨️"],
  75: ["Neve forte", "❄️"],
  77: ["Grãos de neve", "❄️"],
  80: ["Pancadas de chuva fracas", "🌦️"],
  81: ["Pancadas de chuva", "🌧️"],
  82: ["Pancadas de chuva fortes", "⛈️"],
  85: ["Pancadas de neve", "🌨️"],
  86: ["Pancadas de neve fortes", "❄️"],
  95: ["Tempestade", "⛈️"],
  96: ["Tempestade com granizo", "⛈️"],
  99: ["Tempestade severa com granizo", "🌪️"],
};

function descreverCodigo(code) {
  const d = WMO[code] || ["Tempo desconhecido", "🌍"];
  return { condicao: d[0], icone: d[1] };
}

async function geocodificar(cidade) {
  const chave = cidade.toLowerCase().trim();
  const hit = cache.get(`geo:${chave}`);
  if (hit && Date.now() - hit.t < 24 * 60 * 60 * 1000) return hit.v;
  const { data } = await axios.get("https://geocoding-api.open-meteo.com/v1/search", {
    params: { name: cidade, count: 1, language: "pt", format: "json" },
    timeout: 10000,
  });
  if (!data.results || !data.results.length) throw new Error(`Não achei a cidade "${cidade}"`);
  const r = data.results[0];
  const v = {
    latitude: r.latitude,
    longitude: r.longitude,
    nome: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
  };
  cache.set(`geo:${chave}`, { v, t: Date.now() });
  return v;
}

async function buscarClima(cidade) {
  const alvo = (cidade || "").trim() || CIDADE_PADRAO;
  const chaveCache = alvo.toLowerCase();
  const hit = cache.get(`clima:${chaveCache}`);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  try {
    const geo = await geocodificar(alvo);
    const { data } = await axios.get("https://api.open-meteo.com/v1/forecast", {
      params: {
        latitude: geo.latitude,
        longitude: geo.longitude,
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
        daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
        hourly: "precipitation_probability",
        forecast_days: 3,
        timezone: "auto",
      },
      timeout: 10000,
    });
    const cur = data.current || {};
    const hojeD = (data.daily || {}).time?.[0];
    const amanhaIdx = 1;
    const desc = descreverCodigo(cur.weather_code);
    const descHj = descreverCodigo((data.daily?.weather_code || [])[0]);
    const descAm = descreverCodigo((data.daily?.weather_code || [])[amanhaIdx]);
    const resultado = {
      ok: true,
      cidade: geo.nome,
      temperatura: `${Math.round(cur.temperature_2m)}°C`,
      sensacao: `${Math.round(cur.apparent_temperature)}°C`,
      condicao: desc.condicao,
      icone: desc.icone,
      umidade: `${cur.relative_humidity_2m}%`,
      vento: `${Math.round(cur.wind_speed_10m)} km/h`,
      chuvaHojeMax: (data.daily?.precipitation_probability_max || [])[0] ?? null,
      hoje: {
        max: `${Math.round((data.daily?.temperature_2m_max || [])[0])}°C`,
        min: `${Math.round((data.daily?.temperature_2m_min || [])[0])}°C`,
        condicao: descHj.condicao,
        icone: descHj.icone,
        probChuva: (data.daily?.precipitation_probability_max || [])[0] ?? 0,
      },
      amanha: {
        max: `${Math.round((data.daily?.temperature_2m_max || [])[amanhaIdx])}°C`,
        min: `${Math.round((data.daily?.temperature_2m_min || [])[amanhaIdx])}°C`,
        condicao: descAm.condicao,
        icone: descAm.icone,
        probChuva: (data.daily?.precipitation_probability_max || [])[amanhaIdx] ?? 0,
      },
      horasChuva: proximasHorasComChuva(data.hourly),
    };
    cache.set(`clima:${chaveCache}`, { v: resultado, t: Date.now() });
    log("DEBUG", "[CLIMA] Atualizado (Open-Meteo)", { cidade: resultado.cidade, temperatura: resultado.temperatura });
    return resultado;
  } catch (err) {
    log("WARN", "[CLIMA] Erro", { cidade: alvo, erro: err.message });
    const velho = hit ? hit.v : null;
    if (velho) return { ...velho, desatualizado: true };
    return { ok: false, cidade: alvo, erro: err.message };
  }
}

function proximasHorasComChuva(hourly) {
  try {
    const agora = Date.now();
    const tempos = hourly.time || [];
    const probs = hourly.precipitation_probability || [];
    const saida = [];
    for (let i = 0; i < tempos.length; i++) {
      const t = new Date(tempos[i]).getTime();
      if (t < agora - 3600e3) continue;
      if ((probs[i] ?? 0) >= 50) saida.push({ hora: tempos[i].slice(11, 16), prob: probs[i] });
      if (saida.length >= 5) break;
      if (t > agora + 24 * 3600e3) break;
    }
    return saida;
  } catch {
    return [];
  }
}

async function vaiChover(cidade) {
  const c = await buscarClima(cidade);
  if (!c.ok) return c;
  const hojeProb = c.hoje.probChuva || 0;
  const amanhaProb = c.amanha.probChuva || 0;
  const vaiHoje = hojeProb >= 50;
  const vaiAmanha = amanhaProb >= 50;
  let resposta;
  if (vaiHoje) {
    resposta = `${c.icone} Sim! Probabilidade de chuva hoje em ${c.cidade}: **${hojeProb}%**`;
  } else if (hojeProb >= 30) {
    resposta = `🌦️ Talvez — ${hojeProb}% de chance hoje em ${c.cidade}. Leva guarda-chuva por precaução.`;
  } else {
    resposta = `☀️ Não deve chover hoje em ${c.cidade} (${hojeProb}% de chance).`;
  }
  if (c.horasChuva.length) {
    resposta += `\n⏰ Horários com mais chance: ${c.horasChuva.map((h) => `${h.hora} (${h.prob}%)`).join(", ")}`;
  }
  resposta += `\n📅 Amanhã: ${c.amanha.icone} ${c.amanha.condicao}, ${c.amanha.min}~${c.amanha.max}, ${amanhaProb}% de chuva${vaiAmanha ? " ⚠️" : ""}`;
  return { ok: true, resposta, dados: c };
}

module.exports = { clima: buscarClima, vaiChover, descreverCodigo, CIDADE_PADRAO };
