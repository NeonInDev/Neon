// Registra uma atividade manualmente no histórico local da Neon.
// Uso: node scripts/strava_registrar.js km=5 tempo=28:30 [tipo=Run] [nome="treino"]
//    tempo aceita 28:30 (mm:ss), 1:45:00 (h:mm:ss) ou 30 (minutos)
// Os registros vão para strava_export/manuais.json e o plugin do Strava
// mistura automaticamente com o export oficial (activities.csv).

const fs = require("fs");
const path = require("path");

const PASTA = process.env.STRAVA_EXPORT_DIR || path.join(__dirname, "..", "strava_export");
const ARQUIVO = path.join(PASTA, "manuais.json");

function arg(nome, padrao) {
  const m = process.argv.join(" ").match(new RegExp(`${nome}=("[^"]*"|\\S+)`, "i"));
  return m ? m[1].replace(/^"|"$/g, "") : padrao;
}

function tempoParaSegundos(v) {
  if (!v) return 0;
  const partes = String(v).split(":").map((p) => parseFloat(p) || 0);
  if (partes.length === 3) return partes[0] * 3600 + partes[1] * 60 + partes[2];
  if (partes.length === 2) return partes[0] * 60 + partes[1];
  return partes[0] * 60;
}

function main() {
  const km = parseFloat(arg("km", "0"));
  const tempo = arg("tempo", "");
  const tipo = arg("tipo", "Run");
  const nome = arg("nome", "");
  const data = arg("data", "");

  if (km <= 0 || !tempo) {
    console.log("Uso: node strava_registrar.js km=5 tempo=28:30 [tipo=Run] [nome=\"treino\"] [data=2026-08-21]");
    console.log("  tempo: 28:30 = 28min30s | 1:05:00 = 1h05 | 40 = 40 minutos");
    process.exit(1);
  }

  fs.mkdirSync(PASTA, { recursive: true });
  let lista = [];
  if (fs.existsSync(ARQUIVO)) {
    try { lista = JSON.parse(fs.readFileSync(ARQUIVO, "utf8")); } catch {}
  }

  const ts = data ? new Date(`${data}T12:00:00`).getTime() : Date.now();
  lista.push({
    ts,
    data: new Date(ts).toISOString(),
    nome: nome || `${tipo === "Ride" ? "Pedal" : "Corrida"} registrada pela Neon`,
    tipo,
    km,
    movSeg: tempoParaSegundos(tempo),
    elevM: 0,
    hrMed: null,
    kudos: 0,
    fonte: "manual",
  });
  fs.writeFileSync(ARQUIVO, JSON.stringify(lista, null, 2));

  const segPorKm = tempoParaSegundos(tempo) / km;
  const pace = `${Math.floor(segPorKm / 60)}:${String(Math.round(segPorKm % 60)).padStart(2, "0")}/km`;
  console.log(`✅ Registrado: ${km} km em ${tempo} (${pace}) — ${new Date(ts).toLocaleDateString("pt-BR")}`);
  console.log(`Total de registros manuais: ${lista.length}`);
}

main();
