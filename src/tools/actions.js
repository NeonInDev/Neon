const { exec } = require("child_process");

async function executarAcao(texto) {
  const lower = texto.toLowerCase();

  if (lower.includes("abrir spotify")) {
    exec("am start -a android.intent.action.VIEW -d https://open.spotify.com");
    return "🎵 Abrindo Spotify.";
  }

  if (lower.includes("abrir youtube")) {
    exec("am start -a android.intent.action.VIEW -d https://youtube.com");
    return "📺 Abrindo YouTube.";
  }

  if (lower.includes("abrir chrome")) {
    exec("am start -n com.android.chrome/com.google.android.apps.chrome.Main");
    return "🌐 Abrindo Chrome.";
  }

  return null;
}

module.exports = { executarAcao };
