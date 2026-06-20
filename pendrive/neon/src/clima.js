const axios = require("axios")
const { log } = require("./logger")

const CIDADE_PADRAO = "São Paulo"
const CACHE_KEY = "neon_clima_cache"
const cache = { data: null, timestamp: 0, ttl: 30 * 60 * 1000 }

async function clima(cidade) {
  const alvo = cidade || CIDADE_PADRAO
  const agora = Date.now()
  if (cache.data && cache.data.cidade === alvo && (agora - cache.timestamp) < cache.ttl) {
    return cache.data
  }
  try {
    const { data } = await axios.get(`https://wttr.in/${encodeURIComponent(alvo)}?format=j1`, {
      timeout: 10000,
      headers: { "Accept-Language": "pt-BR" }
    })
    if (!data?.current_condition?.[0]) throw new Error("Sem dados")
    const curr = data.current_condition[0]
    const hoje = data.weather?.[0]
    const amanha = data.weather?.[1]
    const resultado = {
      cidade: alvo,
      temperatura: `${curr.temp_C}°C`,
      sensacao: `${curr.FeelsLikeC}°C`,
      condicao: curr.lang_pt?.[0]?.value || curr.weatherDesc?.[0]?.value || curr.weatherDesc?.[0]?.value || "N/A",
      umidade: `${curr.humidity}%`,
      vento: `${curr.windspeedKmph} km/h ${curr.winddir16Point || ""}`,
      visibilidade: `${curr.visibility} km`,
      icone: curr.weatherIconUrl?.[0]?.value || "",
      hoje: hoje ? {
        max: `${hoje.maxtempC}°C`,
        min: `${hoje.mintempC}°C`,
        condicao: hoje.hourly?.[4]?.lang_pt?.[0]?.value || hoje.hourly?.[0]?.weatherDesc?.[0]?.value || ""
      } : null,
      amanha: amanha ? {
        max: `${amanha.maxtempC}°C`,
        min: `${amanha.mintempC}°C`,
        condicao: amanha.hourly?.[4]?.lang_pt?.[0]?.value || amanha.hourly?.[0]?.weatherDesc?.[0]?.value || ""
      } : null
    }
    cache.data = resultado
    cache.timestamp = agora
    log("DEBUG", "[CLIMA] Atualizado", { cidade: alvo, temperatura: resultado.temperatura })
    return resultado
  } catch (err) {
    log("WARN", "[CLIMA] Erro", { cidade: alvo, erro: err.message })
    if (cache.data) return cache.data
    return { cidade: alvo, temperatura: "N/A", condicao: "Nao disponivel", erro: err.message }
  }
}

function climaManhaFormatado() {
  const agora = new Date()
  if (!cache.data) return ""
  const c = cache.data
  const saudacao = agora.getHours() < 12 ? "Bom dia!" : agora.getHours() < 18 ? "Boa tarde!" : "Boa noite!"
  let msg = `${saudacao} O clima em ${c.cidade}: ${c.condicao}, ${c.temperatura}. Umidade ${c.umidade}.`
  if (c.amanha) msg += ` Amanha: ${c.amanha.condicao}, ${c.amanha.min} ~ ${c.amanha.max}.`
  return msg
}

module.exports = { clima, climaManhaFormatado }
