// Integração com o Strava via EXPORT OFICIAL DE DADOS (grátis, sem API).
// Como funciona: em strava.com → Configurações → Minha conta → "Baixe seus dados".
// A Strava envia um .zip por e-mail com activities.csv + arquivos GPX/FIT.
// Extraia o zip dentro da pasta configurada e pronto.
// Config no .env (opcional):
//   STRAVA_EXPORT_DIR=<pasta com o export extraído> (padrão: <raiz>/strava_export)
const fs = require("fs");
const path = require("path");
const { STRAVA_EXPORT_DIR } = require("../src/config");
const { log } = require("../src/logger");

const PASTA = STRAVA_EXPORT_DIR || path.join(__dirname, "..", "strava_export");

let cache = { atividades: null, quando: 0, arquivo: null };

function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Parser CSV simples com suporte a aspas e vírgulas dentro de campos.
function parseCsv(texto) {
  const linhas = [];
  let campo = "";
  let linha = [];
  let entreAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else entreAspas = false;
      } else campo += c;
    } else if (c === '"') {
      entreAspas = true;
    } else if (c === ",") {
      linha.push(campo); campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
  return linhas;
}

function acharColuna(headers, candidatos) {
  const hs = headers.map(norm);
  for (const cand of candidatos) {
    const idx = hs.indexOf(norm(cand));
    if (idx !== -1) return idx;
  }
  for (const cand of candidatos) {
    const c = norm(cand);
    const idx = hs.findIndex((h) => h.includes(c));
    if (idx !== -1) return idx;
  }
  return -1;
}

function tempoParaSegundos(v) {
  if (v == null || v === "") return 0;
  if (/^\d+(\.\d+)?$/.test(String(v).trim())) return parseFloat(v);
  const partes = String(v).split(":").map((p) => parseFloat(p) || 0);
  if (partes.length === 3) return partes[0] * 3600 + partes[1] * 60 + partes[2];
  if (partes.length === 2) return partes[0] * 60 + partes[1];
  return 0;
}

function carregarManuais() {
  const arquivo = path.join(PASTA, "manuais.json");
  if (!fs.existsSync(arquivo)) return [];
  try {
    const lista = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    return Array.isArray(lista)
      ? lista.map((a) => ({
          ts: a.ts || new Date(a.data).getTime() || 0,
          data: a.data || "",
          nome: a.nome || "",
          tipo: a.tipo || "Run",
          km: a.km || 0,
          movSeg: a.movSeg || 0,
          elevM: a.elevM || 0,
          hrMed: a.hrMed || null,
          kudos: a.kudos || 0,
          fonte: "manual",
        }))
      : [];
  } catch {
    return [];
  }
}

function carregar(forcar = false) {
  if (!forcar && cache.atividades && Date.now() - cache.quando < 10 * 60000) {
    return { ok: true, atividades: cache.atividades, arquivo: cache.arquivo };
  }
  if (!fs.existsSync(PASTA)) {
    const manuais = carregarManuais();
    if (manuais.length) {
      manuais.sort((a, b) => b.ts - a.ts);
      cache = { atividades: manuais, quando: Date.now(), arquivo: "manuais.json" };
      return { ok: true, atividades: manuais, arquivo: "manuais.json" };
    }
    return { ok: false, erro: `Pasta do export não existe: ${PASTA}` };
  }
  const csvs = fs.readdirSync(PASTA).filter((f) => /^activities\.csv$/i.test(f));
  if (!csvs.length) {
    const manuais = carregarManuais();
    if (manuais.length) {
      manuais.sort((a, b) => b.ts - a.ts);
      cache = { atividades: manuais, quando: Date.now(), arquivo: "manuais.json" };
      return { ok: true, atividades: manuais, arquivo: "manuais.json" };
    }
    return {
      ok: false,
      erro: `activities.csv não encontrado em ${PASTA}. Extraia o zip do export lá dentro.`,
      conteudo: fs.readdirSync(PASTA).slice(0, 10),
    };
  }
  const arquivo = path.join(PASTA, csvs[0]);
  const linhas = parseCsv(fs.readFileSync(arquivo, "utf8"));
  if (!linhas.length) return { ok: false, erro: "CSV vazio." };

  const headers = linhas[0];
  const iData = acharColuna(headers, ["Activity Date", "Data da Atividade"]);
  const iNome = acharColuna(headers, ["Activity Name", "Nome da Atividade"]);
  const iTipo = acharColuna(headers, ["Activity Type", "Tipo de Atividade"]);
  const iDist = acharColuna(headers, ["Distance (km)", "Distância (km)", "Distance", "Distância"]);
  const iMov = acharColuna(headers, ["Moving Time", "Tempo em Movimento"]);
  const iElev = acharColuna(headers, ["Elevation Gain", "Ganho de Elevação", "Elevação Ganha"]);
  const iHr = acharColuna(headers, ["Average HR", "FC Média", "Frequência Cardíaca Média"]);
  const iKudos = acharColuna(headers, ["Kudos", "Kudos Count"]);

  if (iData === -1) return { ok: false, erro: `Colunas não reconhecidas: ${headers.slice(0, 8).join(", ")}` };

  const atividades = [];
  for (const l of linhas.slice(1)) {
    const dataBruta = l[iData];
    if (!dataBruta) continue;
    const ts = new Date(dataBruta.replace(" ", "T")).getTime();
    const dist = iDist !== -1 ? parseFloat(String(l[iDist]).replace(",", ".")) || 0 : 0;
    atividades.push({
      ts: isNaN(ts) ? 0 : ts,
      data: dataBruta,
      nome: iNome !== -1 ? l[iNome] : "",
      tipo: iTipo !== -1 ? l[iTipo] : "",
      km: dist,
      movSeg: iMov !== -1 ? tempoParaSegundos(l[iMov]) : 0,
      elevM: iElev !== -1 ? parseFloat(String(l[iElev]).replace(",", ".")) || 0 : 0,
      hrMed: iHr !== -1 ? parseInt(l[iHr], 10) || null : null,
      kudos: iKudos !== -1 ? parseInt(l[iKudos], 10) || 0 : 0,
    });
  }
  atividades.sort((a, b) => b.ts - a.ts);

  const manuais = carregarManuais();
  const tudo = atividades.concat(manuais).sort((a, b) => b.ts - a.ts);

  cache = { atividades: tudo, quando: Date.now(), arquivo };
  log("INFO", "[STRAVA] Export carregado", { atividades: tudo.length, arquivo });
  return { ok: true, atividades: tudo, arquivo };
}

function duracao(segundos) {
  const s = Math.round(segundos || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

function paceMinKm(a) {
  if (!a.km || !a.movSeg || a.km < 0.2) return null;
  const segPorKm = a.movSeg / a.km;
  const m = Math.floor(segPorKm / 60);
  const s = Math.round(segPorKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function resumirAtividade(a) {
  const d = new Date(a.ts);
  const partes = [
    `${Math.round(a.km * 10) / 10} km`,
    duracao(a.movSeg),
    paceMinKm(a),
    a.hrMed ? `${a.hrMed} bpm` : null,
    a.kudos ? `👍 ${a.kudos}` : null,
  ].filter(Boolean);
  return `${d.toLocaleDateString("pt-BR")} — ${a.nome || "(sem nome)"} (${a.tipo}) — ${partes.join(" · ")}`;
}

function somar(lista) {
  const dist = lista.reduce((s, a) => s + a.km, 0);
  const tempo = lista.reduce((s, a) => s + a.movSeg, 0);
  const elev = lista.reduce((s, a) => s + a.elevM, 0);
  return { qtd: lista.length, km: Math.round(dist * 10) / 10, tempo: duracao(tempo), elevacaoM: Math.round(elev) };
}

module.exports = {
  nome: "Strava",
  versao: "2.0",
  desc: "Integração com o Strava no modo gratuito: lê o export oficial de dados (activities.csv). Estatísticas de treino sem precisar de assinatura.",

  async iniciar() {
    const r = carregar(true);
    if (r.ok) log("INFO", "[STRAVA] Dados disponíveis", { atividades: r.atividades.length });
    else
      log(
        "INFO",
        "[STRAVA] Sem dados ainda — extraia o export em strava_export/ ou registre com scripts/strava_registrar.js"
      );
  },

  async parar() {
    log("INFO", "[STRAVA] Plugin parado");
  },

  ferramentas: [
    {
      nome: "strava_atividades",
      desc: "Lista atividades recentes do Strava (export local). Uso: strava_atividades | qtd=10, tipo=Run (opcional)",
      async executar(args) {
        const q = String(args || "");
        const qtd = parseInt((q.match(/qtd=(\d+)/i) || [])[1] || "10", 10);
        const tipo = (q.match(/tipo=([\w\s]+)/i) || [])[1];
        const r = carregar();
        if (!r.ok) return `❌ ${r.erro}`;
        let lista = r.atividades;
        if (tipo) lista = lista.filter((a) => norm(a.tipo).includes(norm(tipo.trim())));
        if (!lista.length) return "Nenhuma atividade encontrada.";
        return ["🏃 Atividades recentes:", ...lista.slice(0, Math.min(qtd, 50)).map(resumirAtividade)].join("\n");
      },
    },
    {
      nome: "strava_stats",
      desc: "Estatísticas de treino por período (export local). Uso: strava_stats | periodo=semana|mes|ano|tudo, tipo=Run (opcional)",
      async executar(args) {
        const q = String(args || "");
        const periodo = ((q.match(/periodo=(\w+)/i) || [])[1] || "semana").toLowerCase();
        const tipo = (q.match(/tipo=([\w\s]+)/i) || [])[1];
        const r = carregar();
        if (!r.ok) return `❌ ${r.erro}`;
        let lista = r.atividades;
        if (tipo) lista = lista.filter((a) => norm(a.tipo).includes(norm(tipo.trim())));
        const limites = { semana: 7 * 86400000, mes: 30 * 86400000, ano: 365 * 86400000 };
        if (limites[periodo]) {
          const corte = Date.now() - limites[periodo];
          lista = lista.filter((a) => a.ts >= corte);
        }
        if (!lista.length) return "Nenhuma atividade nesse período.";
        const s = somar(lista);
        const rotulo = { semana: "últimos 7 dias", mes: "últimos ~30 dias", ano: "últimos 365 dias", tudo: "todo o histórico" }[periodo] || periodo;
        const comPace = lista.filter((a) => paceMinKm(a)).sort((a, b) => a.movSeg / a.km - b.movSeg / b.km);
        const maior = [...lista].sort((a, b) => b.km - a.km)[0];
        const linhas = [
          `📊 Strava (${rotulo}${tipo ? `, ${tipo.trim()}` : ""}):`,
          `• ${s.qtd} atividades · ${s.km} km · ${s.tempo} · ${s.elevacaoM} m de subida`,
        ];
        if (comPace.length) linhas.push(`• Melhor pace: ${paceMinKm(comPace[0])} — ${comPace[0].nome || "(sem nome)"}`);
        if (maior && maior.km > 0) linhas.push(`• Maior treino: ${Math.round(maior.km * 10) / 10} km — ${maior.nome || "(sem nome)"}`);
        return linhas.join("\n");
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
          const periodo = /\bano\b/i.test(t) ? "ano" : /m[eê]s/i.test(t) ? "mes" : "semana";
          return module.exports.ferramentas[1].executar(`periodo=${periodo}${tipo ? `, tipo=${tipo}` : ""}`);
        }
        return module.exports.ferramentas[0].executar(`qtd=5${tipo ? `, tipo=${tipo}` : ""}`);
      },
    },
  ],
};
