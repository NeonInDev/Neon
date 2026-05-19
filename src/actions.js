const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const { log } = require("./logger");

const exec = promisify(execCb);
const TIMEOUT = 5000;

async function tentar(comando) {
  log("INFO", "[ACTION] tentando comando", { comando });
  try {
    const { stdout, stderr } = await exec(comando, { timeout: TIMEOUT });
    if (stdout) log("INFO", "[ACTION] stdout", { comando, stdout: stdout.trim() });
    if (stderr) log("WARN", "[ACTION] stderr", { comando, stderr: stderr.trim() });
    log("INFO", "[ACTION] comando OK", { comando });
    return true;
  } catch (err) {
    log("WARN", "[ACTION] comando FALHOU", { comando, erro: err.message });
    return false;
  }
}

async function abrirUrl(url) {
  log("INFO", "[ACTION] tentando abrir URL", { url });
  if (await tentar(`termux-open "${url}"`)) return "direto";
  log("INFO", "[ACTION] termux-open falhou, tentando am start", { url });
  if (await tentar(`am start --user 0 -a android.intent.action.VIEW -d "${url}"`)) return "direto";
  log("INFO", "[ACTION] am start falhou, tentando notificacao", { url });
  if (await tentar(`termux-notification --id neon_abrir --title "Neon" --content "Toque para abrir" --action "${url}" --alert-once --priority high`)) return "notificacao";
  log("WARN", "[ACTION] todos os metodos falharam para URL", { url });
  return null;
}

async function abrirComando(comando, label) {
  log("INFO", "[ACTION] executando comando direto", { comando, label });
  if (await tentar(comando)) return "direto";
  log("INFO", "[ACTION] comando direto falhou, tentando notificacao", { comando, label });
  if (await tentar(`termux-notification --id neon_abrir --title "Neon" --content "Toque para abrir ${label}" --action "${comando}" --alert-once --priority high`)) return "notificacao";
  log("WARN", "[ACTION] todos os metodos falharam para comando", { comando, label });
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
  if (!app) {
    log("INFO", "[ACTION] nenhum app reconhecido", { texto });
    return null;
  }

  const label = app.nomes[0];
  log("INFO", "[ACTION] app detectado", { label, texto, url: app.url, comando: app.comando });

  let via = null;
  if (app.url) {
    via = await abrirUrl(app.url);
  } else if (app.comando) {
    via = await abrirComando(app.comando, label);
  }

  log("INFO", "[ACTION] resultado final", { label, via });
  if (via === "direto") return `✅ Abrindo ${label}.`;
  if (via === "notificacao") return `📲 Toque na notificação para abrir ${label}.`;
  return `❌ Não consegui abrir ${label}.`;
}

module.exports = { executarAcao };
