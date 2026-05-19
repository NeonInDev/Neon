const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const { log } = require("./logger");

const exec = promisify(execCb);
const TIMEOUT = 5000;

const AM_BASE = "am start --user 0 -a android.intent.action.VIEW -d";

async function executar(comando) {
  try {
    const { stdout, stderr } = await exec(comando, { timeout: TIMEOUT });
    if (stderr) log("WARN", "stderr do comando", { comando, stderr: stderr.trim() });
    return true;
  } catch (err) {
    log("ERROR", "comando falhou", { comando, erro: err.message });
    return false;
  }
}

async function tentarTermuxOpen(url) {
  try {
    await exec(`termux-open "${url}"`, { timeout: TIMEOUT });
    return true;
  } catch {
    return false;
  }
}

async function tentarUrl(url) {
  if (await tentarTermuxOpen(url)) return true;
  return await executar(`${AM_BASE} "${url}"`);
}

const apps = [
  { nomes: ["spotify"],           acao: () => tentarUrl("https://open.spotify.com") },
  { nomes: ["youtube", "yt"],     acao: () => tentarUrl("https://youtube.com") },
  { nomes: ["chrome"],            acao: () => tentarUrl("https://google.com") },
  { nomes: ["whatsapp", "zap"],   acao: () => tentarUrl("https://wa.me") },
  { nomes: ["telegram", "tg"],    acao: () => tentarUrl("https://t.me") },
  { nomes: ["instagram", "insta"], acao: () => tentarUrl("https://instagram.com") },
  { nomes: ["twitter", "x"],      acao: () => tentarUrl("https://x.com") },
  { nomes: ["discord"],           acao: () => tentarUrl("https://discord.com/channels/@me") },
  { nomes: ["gmail", "email"],    acao: () => tentarUrl("https://mail.google.com") },
  { nomes: ["maps", "mapa"],      acao: () => tentarUrl("https://maps.google.com") },
  { nomes: ["camera", "câmera"],  acao: () => executar("am start --user 0 -a android.media.action.IMAGE_CAPTURE") },
  { nomes: ["config", "configuração", "configuracoes", "ajustes", "settings"],
                                  acao: () => executar("am start --user 0 -a android.settings.SETTINGS") },
];

function encontrarApp(texto) {
  const lower = texto.toLowerCase().trim();
  const match = lower.match(/^(?:abrir|abra|abre|open)\s+(.+)/i);
  if (!match) return null;

  const nomeBuscado = match[1].trim().toLowerCase();

  for (const app of apps) {
    if (app.nomes.some((n) => nomeBuscado.includes(n))) {
      return { label: app.nomes[0], executar: app.acao };
    }
  }

  return { label: nomeBuscado, executar: null };
}

async function executarAcao(texto) {
  const app = encontrarApp(texto);
  if (!app) return null;

  if (!app.executar) {
    const url = `https://${app.label}.com`;
    const ok = await tentarUrl(url);
    return ok ? `📱 Abrindo ${app.label}...` : `❌ Não consegui abrir ${app.label}.`;
  }

  const ok = await app.executar();
  return ok ? `✅ Abrindo ${app.label}.` : `❌ Erro ao tentar abrir ${app.label}. Verifique os logs.`;
}

module.exports = { executarAcao };
