const { exec } = require("child_process");

const apps = {
  spotify: {
    nome: "Spotify",
    acao: () =>
      exec("am start -a android.intent.action.VIEW -d https://open.spotify.com"),
  },
  youtube: {
    nome: "YouTube",
    acao: () =>
      exec("am start -a android.intent.action.VIEW -d https://youtube.com"),
  },
  chrome: {
    nome: "Chrome",
    acao: () =>
      exec("am start -n com.android.chrome/com.google.android.apps.chrome.Main"),
  },
  whatsapp: {
    nome: "WhatsApp",
    acao: () =>
      exec("am start -n com.whatsapp/com.whatsapp.Main"),
  },
  telegram: {
    nome: "Telegram",
    acao: () =>
      exec("am start -n org.telegram.messenger/org.telegram.ui.LaunchActivity"),
  },
  instagram: {
    nome: "Instagram",
    acao: () =>
      exec("am start -n com.instagram.android/com.instagram.mainactivity.MainActivity"),
  },
  twitter: {
    nome: "Twitter / X",
    acao: () =>
      exec("am start -n com.twitter.android/com.twitter.android.StartActivity"),
  },
  discord: {
    nome: "Discord",
    acao: () =>
      exec("am start -n com.discord/com.discord.app.AppActivity$Main"),
  },
  gmail: {
    nome: "Gmail",
    acao: () =>
      exec("am start -n com.google.android.gm/com.google.android.gm.ConversationListActivityGmail"),
  },
  maps: {
    nome: "Google Maps",
    acao: () =>
      exec("am start -n com.google.android.apps.maps/com.google.android.maps.MapsActivity"),
  },
  camera: {
    nome: "Câmera",
    acao: () =>
      exec("am start -a android.media.action.IMAGE_CAPTURE"),
  },
  config: {
    nome: "Configurações",
    acao: () =>
      exec("am start -a android.settings.SETTINGS"),
  },
};

function encontrarApp(texto) {
  const lower = texto.toLowerCase().trim();

  const padraoDireto = lower.match(/^(?:abrir|abra|abre|open)\s+(.+)/i);
  if (!padraoDireto) return null;

  const nomeBuscado = padraoDireto[1].trim().toLowerCase();

  const correspondencia = Object.entries(apps).find(([chave, app]) => {
    const sinonimos = [chave, app.nome.toLowerCase()];
    return sinonimos.some((s) => nomeBuscado.includes(s));
  });

  if (correspondencia) {
    const [chave, app] = correspondencia;
    return { nome: app.nome, executar: app.acao };
  }

  return { nome: nomeBuscado, executar: null };
}

async function executarAcao(texto) {
  const app = encontrarApp(texto);
  if (!app) return null;

  if (app.executar) {
    try {
      app.executar();
      return `✅ Abrindo ${app.nome}.`;
    } catch {
      return `❌ Erro ao tentar abrir ${app.nome}.`;
    }
  }

  try {
    exec(`am start -a android.intent.action.VIEW -d https://${app.nome}.com`);
  } catch {}
  return `📱 Tentando abrir ${app.nome}...`;
}

function listarApps() {
  return Object.values(apps).map((a) => a.nome.toLowerCase());
}

module.exports = { executarAcao, listarApps };
