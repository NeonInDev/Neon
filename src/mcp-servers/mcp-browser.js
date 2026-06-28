const { log } = require("../logger");
const { abrirUrlNoOpera, tocarSpotify, tocarVideoYouTube, executarRoteiro } = require("../browser");

const tools = [
  { nome: "abrir_site", desc: "Abre um site no navegador (Opera GX).", formato: "abrir_site | [url]" },
  { nome: "abrir_app", desc: "Abre um app/programa.", formato: "abrir_app | [nome]" },
  { nome: "tocar_musica", desc: "Toca uma musica no Spotify.", formato: "tocar_musica | [nome da musica]" },
  { nome: "tocar_playlist", desc: "Toca uma playlist no Spotify.", formato: "tocar_playlist | [nome da playlist ou link]" },
  { nome: "tocar_video", desc: "Toca um video no YouTube.", formato: "tocar_video | [nome do video]" },
  { nome: "youtube_pip", desc: "Ativa Picture-in-Picture no YouTube.", formato: "youtube_pip" },
  { nome: "youtube_fullscreen", desc: "Ativa tela cheia no YouTube.", formato: "youtube_fullscreen" },
];

const musicQueue = { items: [], current: null, processing: false };

async function processMusicQueue() {
  if (musicQueue.processing || musicQueue.items.length === 0) return;
  musicQueue.processing = true;
  while (musicQueue.items.length > 0) {
    const item = musicQueue.items.shift();
    musicQueue.current = item;
    try {
      if (item.type === "spotify") { await tocarSpotify(item.termo); }
      else if (item.type === "youtube") { await tocarVideoYouTube(item.termo, 0); }
    } catch (err) {
      log("WARN", "[MCP-BROWSER] Falha ao tocar", { termo: item.termo, erro: err.message });
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  musicQueue.current = null;
  musicQueue.processing = false;
}

async function handleCall(nome, args) {
  switch (nome) {
    case "abrir_site": {
      if (!args) return "Nada para abrir.";
      let url = args;
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      await abrirUrlNoOpera(url);
      return `✅ Abri ${url} no Opera GX.`;
    }

    case "abrir_app": {
      try {
        const { executarAcao } = require("../actions");
        return await executarAcao(args, "app");
      } catch { return `❌ App "${args}" não encontrado.`; }
    }

    case "tocar_musica":
    case "tocar_playlist": {
      if (!args) return "Nada para tocar.";
      musicQueue.items.push({ type: "spotify", termo: args });
      processMusicQueue();
      return `🎵 Adicionei "${args}" à fila do Spotify.`;
    }

    case "tocar_video": {
      if (!args) return "Nada para tocar.";
      musicQueue.items.push({ type: "youtube", termo: args });
      processMusicQueue();
      return `🎬 Adicionei "${args}" à fila do YouTube.`;
    }

    case "youtube_pip": {
      const res = await executarRoteiro("pip");
      return res?.ok ? `🖼️ ${res.msg}` : "❌ Não consegui ativar PiP.";
    }

    case "youtube_fullscreen": {
      const res = await executarRoteiro("fullscreen");
      return res?.ok ? `🖥️ ${res.msg}` : "❌ Não consegui ativar tela cheia.";
    }

    default:
      throw new Error(`Tool desconhecida: ${nome}`);
  }
}

module.exports = { nome: "Browser", tools, handleCall };
