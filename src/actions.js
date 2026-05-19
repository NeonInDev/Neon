const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const { log } = require("./logger");

const exec = promisify(execCb);
const TIMEOUT = 5000;

async function tentar(comando) {
  try {
    const { stdout, stderr } = await exec(comando, { timeout: TIMEOUT });
    if (stderr) log("WARN", "stderr", { comando, stderr: stderr.trim() });
    return true;
  } catch (err) {
    log("WARN", "falhou", { comando, erro: err.message });
    return false;
  }
}

async function abrirUrl(url) {
  if (await tentar(`termux-open "${url}"`)) return "direto";
  if (await tentar(`am start --user 0 -a android.intent.action.VIEW -d "${url}"`)) return "direto";
  if (await tentar(`termux-notification --id neon_abrir --title "Neon" --content "Toque para abrir" --action "${url}" --alert-once --priority high`)) return "notificacao";
  return null;
}

async function abrirComando(comando, label) {
  if (await tentar(comando)) return "direto";
  if (await tentar(`termux-notification --id neon_abrir --title "Neon" --content "Toque para abrir ${label}" --action "${comando}" --alert-once --priority high`)) return "notificacao";
  return null;
}

const apps = [
  { nomes: ["spotify"],           url: "https://open.spotify.com" },
  { nomes: ["youtube", "yt"],     url: "https://youtube.com" },
  { nomes: ["chrome"],            url: "https://google.com" },
  { nomes: ["whatsapp", "zap"],   url: "https://wa.me" },
  { nomes: ["telegram", "tg"],    url: "https://t.me" },
  { nomes: ["instagram", "insta"], url: "https://instagram.com" },
  { nomes: ["twitter", "x"],      url: "https://x.com" },
  { nomes: ["discord"],           url: "https://discord.com/channels/@me" },
  { nomes: ["gmail", "email"],    url: "https://mail.google.com" },
  { nomes: ["maps", "mapa"],      url: "https://maps.google.com" },
  { nomes: ["camera", "câmera"],  comando: "am start --user 0 -a android.media.action.IMAGE_CAPTURE" },
  { nomes: ["config", "configuração", "configuracoes", "ajustes", "settings"],
                                  comando: "am start --user 0 -a android.settings.SETTINGS" },
];

function encontrarApp(texto) {
  const lower = texto.toLowerCase().trim();
  const match = lower.match(/^(?:abrir|abra|abre|open)\s+(.+)/i);
  if (!match) return null;

  const nomeBuscado = match[1].trim().toLowerCase();
  return apps.find((app) => app.nomes.some((n) => nomeBuscado.includes(n)))
    || { nomes: [nomeBuscado], url: `https://${nomeBuscado}.com` };
}

async function executarAcao(texto) {
  const app = encontrarApp(texto);
  if (!app) return null;

  const label = app.nomes[0];

  let via = null;
  if (app.url) {
    via = await abrirUrl(app.url);
  } else if (app.comando) {
    via = await abrirComando(app.comando, label);
  }

  if (via === "direto") return `✅ Abrindo ${label}.`;
  if (via === "notificacao") return `📲 Toque na notificação para abrir ${label}.`;
  return `❌ Não consegui abrir ${label}.`;
}

module.exports = { executarAcao };
