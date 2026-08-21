// Integração com a API oficial do Strava.
// Requer conta assinante (a API do Strava é exclusiva de assinantes).
// Config no .env:
//   STRAVA_CLIENT_ID=<id da aplicação criada em strava.com/settings/api>
//   STRAVA_CLIENT_SECRET=<secret da aplicação>
//   STRAVA_REFRESH_TOKEN=<gerado por scripts/strava_oauth.js>
const axios = require("axios");
const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = require("../src/config");
const { log } = require("../src/logger");

const TOKEN_URL = "https://www.strava.com/oauth/token";
const API_BASE = "https://www.strava.com/api/v3";

let accessToken = null;
let tokenExpira = 0;

function configurado() {
  return Boolean(STRAVA_CLIENT_ID && STRAVA_CLIENT_SECRET && STRAVA_REFRESH_TOKEN);
}

function status() {
  return {
    configurado: configurado(),
    temClientId: Boolean(STRAVA_CLIENT_ID),
    temSecret: Boolean(STRAVA_CLIENT_SECRET),
    temRefreshToken: Boolean(STRAVA_REFRESH_TOKEN),
    conectado: Boolean(accessToken && Date.now() < tokenExpira),
  };
}

async function tokenAcesso() {
  if (!configurado()) {
    throw new Error("Strava não configurado — preencha STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET e STRAVA_REFRESH_TOKEN no .env");
  }
  if (accessToken && Date.now() < tokenExpira - 60000) return accessToken;
  const r = await axios.post(TOKEN_URL, null, {
    params: {
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: STRAVA_REFRESH_TOKEN,
    },
    timeout: 30000,
  });
  accessToken = r.data.access_token;
  tokenExpira = Date.now() + (r.data.expires_at ? r.data.expires_at * 1000 - Date.now() : 3600000);
  log("INFO", "[STRAVA] Token de acesso renovado");
  return accessToken;
}

async function chamar(recurso, params = {}) {
  const token = await tokenAcesso();
  const r = await axios.get(`${API_BASE}${recurso}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
    timeout: 30000,
  });
  return r.data;
}

function extrairErro(err) {
  const d = err?.response?.data;
  if (d?.message) return d.message;
  if (d?.errors?.length) return JSON.stringify(d.errors).slice(0, 200);
  if (err?.code === "ECONNABORTED") return "timeout na API do Strava";
  return err?.message?.slice(0, 200) || "erro desconhecido";
}

function km(metros) {
  return Math.round((metros || 0) / 100) / 10;
}

function duracao(segundos) {
  const s = Math.round(segundos || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

function paceMinKm(at) {
  if (!at.distance || !at.moving_time || at.distance < 200) return null;
  const segPorKm = at.moving_time / (at.distance / 1000);
  const m = Math.floor(segPorKm / 60);
  const s = Math.round(segPorKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function resumirAtividade(a) {
  const data = new Date(a.start_date_local || a.start_date);
  const partes = [
    `${km(a.distance)} km`,
    duracao(a.moving_time),
    paceMinKm(a),
    a.average_heartrate ? `${Math.round(a.average_heartrate)} bpm` : null,
    a.kudos_count ? `👍 ${a.kudos_count}` : null,
  ].filter(Boolean);
  return `${data.toLocaleDateString("pt-BR")} — ${a.name} (${a.type}) — ${partes.join(" · ")}`;
}

async function listarAtividades(qtd = 10, tipo = null, antesDe = null) {
  const dados = await chamar("/athlete/activities", {
    per_page: Math.min(Math.max(parseInt(qtd, 10) || 10, 1), 100),
    ...(antesDe ? { before: antesDe } : {}),
  });
  let lista = Array.isArray(dados) ? dados : [];
  if (tipo) lista = lista.filter((a) => String(a.type).toLowerCase() === String(tipo).toLowerCase());
  return lista;
}

function somar(lista) {
  const dist = lista.reduce((s, a) => s + (a.distance || 0), 0);
  const tempo = lista.reduce((s, a) => s + (a.moving_time || 0), 0);
  const ganho = lista.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);
  return { qtd: lista.length, km: km(dist), tempo: duracao(tempo), elevacaoM: Math.round(ganho) };
}

module.exports = {
  nome: "Strava",
  versao: "1.0",
  desc: "Integração com o Strava: atividades recentes e estatísticas de treino (requer assinatura Strava para acesso à API).",

  async iniciar() {
    if (!configurado()) {
      log("INFO", "[STRAVA] Aguardando credenciais (.env: STRAVA_CLIENT_ID/SECRET/REFRESH_TOKEN) — gere com scripts/strava_oauth.js");
      return;
    }
    log("INFO", "[STRAVA] Plugin ativo", status());
  },

  async parar() {
    log("INFO", "[STRAVA] Plugin parado");
  },

  ferramentas: [
    {
      nome: "strava_atividades",
      desc: "Lista atividades recentes do Strava. Uso: strava_atividades | qtd=10, tipo=Run (opcional)",
      async executar(args) {
        if (!configurado()) return "❌ Strava não configurado no .env";
        const q = String(args || "");
        const qtd = (q.match(/qtd=(\d+)/i) || [])[1] || 10;
        const tipo = (q.match(/tipo=(\w+)/i) || [])[1] || null;
        try {
          const lista = await listarAtividades(qtd, tipo);
          if (!lista.length) return "Nenhuma atividade encontrada.";
          return ["🏃 Atividades recentes:", ...lista.map(resumirAtividade)].join("\n");
        } catch (err) {
          log("ERROR", "[STRAVA] listarAtividades falhou", { erro: extrairErro(err) });
          return `❌ ${extrairErro(err)}`;
        }
      },
    },
    {
      nome: "strava_stats",
      desc: "Estatísticas de treino por período. Uso: strava_stats | periodo=semana|mes|ano|tudo, tipo=Run (opcional)",
      async executar(args) {
        if (!configurado()) return "❌ Strava não configurado no .env";
        const q = String(args || "");
        const periodo = ((q.match(/periodo=(\w+)/i) || [])[1] || "semana").toLowerCase();
        const tipo = (q.match(/tipo=(\w+)/i) || [])[1] || null;
        try {
          const agora = Date.now() / 1000;
          const limites = { semana: 7 * 86400, mes: 30 * 86400, ano: 365 * 86400 };
          let pagina = 1;
          let todas = [];
          let buscouTudo = false;
          while (todas.length < 300) {
            const lote = await chamar("/athlete/activities", { per_page: 100, page: pagina });
            if (!Array.isArray(lote) || !lote.length) break;
            todas = todas.concat(lote);
            const maisAntiga = new Date(lote[lote.length - 1].start_date).getTime() / 1000;
            if (limites[periodo] && agora - maisAntiga > limites[periodo]) break;
            if (!limites[periodo]) { buscouTudo = true; break; }
            pagina++;
          }
          let recorte = todas;
          if (limites[periodo]) {
            const corte = agora - limites[periodo];
            recorte = todas.filter((a) => new Date(a.start_date).getTime() / 1000 >= corte);
          }
          if (tipo) recorte = recorte.filter((a) => String(a.type).toLowerCase() === tipo.toLowerCase());
          if (!recorte.length) return `Nenhuma atividade ${periodo === "tudo" && !buscouTudo ? "carregada" : "nesse período"}.`;
          const s = somar(recorte);
          const rotulo = { semana: "últimos 7 dias", mes: "últimos ~30 dias", ano: "últimos 365 dias", tudo: "todo o histórico carregado" }[periodo] || periodo;
          const melhorPace = recorte
            .filter((a) => paceMinKm(a))
            .sort((a, b) => a.moving_time / a.distance - b.moving_time / b.distance)[0];
          const linhas = [
            `📊 Strava (${rotulo}${tipo ? `, ${tipo}` : ""}):`,
            `• ${s.qtd} atividades · ${s.km} km · ${s.tempo} · ${s.elevacaoM} m de subida`,
          ];
          if (melhorPace) linhas.push(`• Melhor pace: ${paceMinKm(melhorPace)} — ${melhorPace.name}`);
          return linhas.join("\n");
        } catch (err) {
          log("ERROR", "[STRAVA] stats falhou", { erro: extrairErro(err) });
          return `❌ ${extrairErro(err)}`;
        }
      },
    },
  ],

  acoes: [
    {
      padrao: /^(strava|corridas?|pedaladas?)\b/i,
      async executar(texto) {
        const t = String(texto || "").toLowerCase();
        const ehStats = /stat|total|resumo|semana|m[eê]s|ano|progresso/i.test(t);
        const tipo = /bike|pedal/i.test(t) ? "Ride" : /corrid|run/i.test(t) ? "Run" : null;
        if (ehStats) {
          const periodo = /ano/i.test(t) ? "ano" : /m[eê]s/i.test(t) ? "mes" : "semana";
          return module.exports.ferramentas[1].executar(`periodo=${periodo}${tipo ? `, tipo=${tipo}` : ""}`);
        }
        return module.exports.ferramentas[0].executar(`qtd=5${tipo ? `, tipo=${tipo}` : ""}`);
      },
    },
  ],
};
