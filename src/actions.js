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
    return true;
  } catch (err) {
    log("WARN", "[ACTION] comando FALHOU", { comando, erro: err.message });
    return false;
  }
}

async function abrirUrl(url) {
  if (process.platform === "win32") {
    if (await tentar(`start "" "${url}"`)) return "direto";
    return null;
  }
  if (await tentar(`termux-open "${url}"`)) return "direto";
  if (await tentar(`am start --user 0 -a android.intent.action.VIEW -d "${url}"`)) return "direto";
  if (await tentar(`termux-notification --id neon_abrir --title "Neon" --content "Toque para abrir" --action "${url}" --alert-once --priority high`)) return "notificacao";
  return null;
}

async function abrirComando(comando, label) {
  if (await tentar(comando)) return "direto";
  if (process.platform !== "win32") {
    if (await tentar(`termux-notification --id neon_abrir --title "Neon" --content "Toque para abrir ${label}" --action "${comando}" --alert-once --priority high`)) return "notificacao";
  }
  return null;
}

function isWin() {
  return process.platform === "win32";
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
  { nomes: ["camera", "câmera"],  comando: "am start --user 0 -a android.media.action.IMAGE_CAPTURE", so: "android" },
  { nomes: ["config", "configuração", "configuracoes", "ajustes", "settings"],
                                  comando: "am start --user 0 -a android.settings.SETTINGS", so: "android" },
  // Windows apps
  { nomes: ["explorador", "explorer", "arquivos"],
                                  comando: "start explorer", so: "win32" },
  { nomes: ["bloco de notas", "bloco", "notepad"],
                                  comando: "start notepad", so: "win32" },
  { nomes: ["cmd", "terminal", "prompt"],
                                  comando: "start cmd", so: "win32" },
  { nomes: ["powershell"],
                                  comando: "start powershell", so: "win32" },
  { nomes: ["calculadora", "calc"],
                                  comando: "start calc", so: "win32" },
  { nomes: ["painel de controle", "painel", "control"],
                                  comando: "start control", so: "win32" },
  { nomes: ["navegador", "browser", "edge"],
                                  url: "https://google.com" },
];

const pcCommands = [
  { nomes: ["desligar", "desligar pc"], fn: async () => (await tentar("shutdown /s /t 15")) ? "🖥️ Desligando em 15s. Use `neon, cancelar` para cancelar." : null },
  { nomes: ["reiniciar", "reiniciar pc"], fn: async () => (await tentar("shutdown /r /t 15")) ? "🖥️ Reiniciando em 15s." : null },
  { nomes: ["cancelar", "cancelar desligamento", "parar"], fn: async () => (await tentar("shutdown /a")) ? "✅ Cancelado." : null },
  { nomes: ["suspender", "hibernar"], fn: async () => (await tentar("rundll32.exe powrprof.dll,SetSuspendState 0,1,0")) ? "💤 Suspenso." : null },
  { nomes: ["bloquear", "travar", "lock"], fn: async () => (await tentar("rundll32.exe user32.dll,LockWorkStation")) ? "🔒 PC bloqueado." : null },
];

function encontrarApp(texto) {
  const lower = texto.toLowerCase().trim();
  const match = lower.match(/^(?:abrir|abra|abre|open)\s+(.+)/i);
  if (!match) return null;

  const nomeBuscado = match[1].trim().toLowerCase();
  const candidato = apps.find((app) => {
    if (app.so && app.so !== process.platform && !(app.so === "android" && !isWin())) return false;
    if (app.so === "android" && isWin()) return false;
    if (app.so === "win32" && !isWin()) return false;
    return app.nomes.some((n) => nomeBuscado.includes(n));
  });
  return candidato || { nomes: [nomeBuscado], url: `https://${nomeBuscado}.com` };
}

function encontrarPcCommand(texto) {
  const lower = texto.toLowerCase().trim();
  return pcCommands.find((c) => c.nomes.some((n) => lower.includes(n)));
}

async function executarAcao(texto, usuarioMestre = false) {
  const app = encontrarApp(texto);
  if (app) {
    const label = app.nomes[0];
    log("INFO", "[ACTION] app detectado", { label, texto, url: app.url, comando: app.comando });
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

  if (usuarioMestre && isWin()) {
    const pcCmd = encontrarPcCommand(texto);
    if (pcCmd) {
      log("INFO", "[ACTION] comando PC detectado", { label: pcCmd.nomes[0], texto });
      const result = await pcCmd.fn();
      if (result) return result;
    }
  }

  log("INFO", "[ACTION] nenhuma ação reconhecida", { texto });
  return null;
}

module.exports = { executarAcao };