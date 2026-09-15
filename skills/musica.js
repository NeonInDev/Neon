const path = require("path");
const axios = require("axios");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const SPOTIFY_URL_RE = /open\.spotify\.com\/(track|playlist|album|artist|show|episode)\/([A-Za-z0-9]{22})/i;
const SPOTIFY_URI_RE = /spotify:(track|playlist|album|artist|show|episode):([A-Za-z0-9]{22})/i;

function extrairSpotifyInfo(url) {
  const m = url.match(SPOTIFY_URL_RE) || url.match(SPOTIFY_URI_RE);
  if (!m) return null;
  return { tipo: m[1], id: m[2] };
}

let tokenCache = { valor: null, expira: 0 };

async function buscarSpotifyToken() {
  if (tokenCache.valor && Date.now() < tokenCache.expira) return tokenCache.valor;
  try {
    const r = await axios.get("https://open.spotify.com/get_access_token?reason=transport&productType=embed", {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!r.data?.accessToken) return null;
    tokenCache = { valor: r.data.accessToken, expira: Date.now() + (r.data.expiresIn || 3000) * 900 };
    return tokenCache.valor;
  } catch { return null; }
}

async function infoViaOEmbed(urlSpotify) {
  try {
    const r = await axios.get("https://open.spotify.com/oembed?url=" + encodeURIComponent(urlSpotify), {
      timeout: 10000,
      headers: { "User-Agent": UA },
    });
    return {
      nome: r.data.title || "",
      artista: r.data.author_name || "",
      url: urlSpotify,
    };
  } catch { return null; }
}

async function infoFaixa(trackId, urlBonus) {
  const viaApi = await infoFaixaApi(trackId);
  if (viaApi) return viaApi;
  const oe = await infoViaOEmbed(`https://open.spotify.com/track/${trackId}`);
  if (oe) return { ...oe, tipo: "track" };
  return null;
}

async function infoFaixaApi(trackId) {
  const token = await buscarSpotifyToken();
  if (!token) return null;
  try {
    const r = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
    });
    const t = r.data;
    return {
      nome: t.name,
      artista: t.artists?.map((a) => a.name).join(", ") || "Desconhecido",
      album: t.album?.name || "",
      duracaoMs: t.duration_ms,
      url: t.external_urls?.spotify || `https://open.spotify.com/track/${trackId}`,
      preview: t.preview_url || null,
    };
  } catch { return null; }
}

async function infoPlaylist(playlistId) {
  const viaApi = await infoPlaylistApi(playlistId);
  if (viaApi) return viaApi;
  const oe = await infoViaOEmbed(`https://open.spotify.com/playlist/${playlistId}`);
  if (oe) return { ...oe, tipo: "playlist" };
  return null;
}

async function infoPlaylistApi(playlistId) {
  const token = await buscarSpotifyToken();
  if (!token) return null;
  try {
    const r = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
    });
    const p = r.data;
    return {
      nome: p.name,
      dono: p.owner?.display_name || "Desconhecido",
      totalFaixas: p.tracks?.total || 0,
      url: p.external_urls?.spotify || `https://open.spotify.com/playlist/${playlistId}`,
    };
  } catch { return null; }
}

async function infoAlbum(albumId) {
  const viaApi = await infoAlbumApi(albumId);
  if (viaApi) return viaApi;
  const oe = await infoViaOEmbed(`https://open.spotify.com/album/${albumId}`);
  if (oe) return { ...oe, tipo: "album" };
  return null;
}

async function infoAlbumApi(albumId) {
  const token = await buscarSpotifyToken();
  if (!token) return null;
  try {
    const r = await axios.get(`https://api.spotify.com/v1/albums/${albumId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
    });
    const a = r.data;
    return {
      nome: a.name,
      artista: a.artists?.map((x) => x.name).join(", ") || "Desconhecido",
      totalFaixas: a.total_tracks || 0,
      url: a.external_urls?.spotify || `https://open.spotify.com/album/${albumId}`,
    };
  } catch { return null; }
}

const execSync = require("child_process").execSync;

let configAdb = null;
try { configAdb = require(path.join(__dirname, "..", "data", "config", "celular.json")); } catch {}

function acharAdbPath() {
  const candidatos = [
    configAdb?.adb || "",
    "C:\\Users\\Pichau\\Android\\platform-tools\\adb.exe",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", "adb.exe") : "",
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "Android", "platform-tools", "adb.exe") : "",
  ].filter(Boolean);
  for (const c of candidatos) {
    try { if (require("fs").existsSync(c)) return c; } catch {}
  }
  try {
    const out = execSync("where adb", { timeout: 3000, windowsHide: true }).toString().trim().split(/\r?\n/)[0];
    if (out) return out;
  } catch {}
  return "adb";
}

async function rodarAdb(args, timeout = 10000) {
  const adbPath = acharAdbPath();
  const { execFileSync } = require("child_process");
  return execFileSync(adbPath, args, { timeout, windowsHide: true, stdio: "pipe", encoding: "utf8" });
}

async function tocarDesktop(termoOuUrl) {
  const { tocarSpotify } = require(path.join(__dirname, "..", "src", "browser"));
  const info = extrairSpotifyInfo(termoOuUrl);
  if (info && info.tipo === "track") {
    const { abrirUrlNoOpera } = require(path.join(__dirname, "..", "src", "browser"));
    await abrirUrlNoOpera(`https://open.spotify.com/track/${info.id}`);
    const d = await infoFaixa(info.id);
    return d ? `Tocando **${d.nome}** — ${d.artista} no Spotify (desktop).` : `Tocando a faixa no Spotify (desktop).`;
  }
  return await tocarSpotify(termoOuUrl);
}

async function tocarCelular(termoOuUrl) {
  const celular = require(path.join(__dirname, "..", "src", "celular"));
  const st = await celular.status();
  if (!st.ok) return `❌ Celular não conectado: ${st.erro || "sem dispositivo"}`;

  const info = extrairSpotifyInfo(termoOuUrl);

  if (info && info.tipo === "track") {
    await celular.abrirApp("com.spotify.music");
    await new Promise((r) => setTimeout(r, 2000));
    try {
      await rodarAdb(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `spotify:track:${info.id}`, "-p", "com.spotify.music"]);
    } catch {}
    const d = await infoFaixa(info.id);
    return d ? `Tocando **${d.nome}** — ${d.artista} no celular.` : `Tocando a faixa no celular.`;
  }

  await celular.abrirApp("com.spotify.music");
  return `Abri o Spotify no celular. Busca por "${termoOuUrl}" no app.`;
}

async function avaliarLink(url) {
  const info = extrairSpotifyInfo(url);
  if (!info) return `❌ Não consegui identificar um link do Spotify na URL: ${url}`;

  let dados = null;
  let emoji = "";
  if (info.tipo === "track") { dados = await infoFaixa(info.id, url); emoji = "🎵"; }
  else if (info.tipo === "playlist") { dados = await infoPlaylist(info.id); emoji = "📋"; }
  else if (info.tipo === "album") { dados = await infoAlbum(info.id); emoji = "💿"; }
  else { dados = await infoViaOEmbed(url); emoji = "🔗"; }

  if (!dados) return `❌ Não consegui puxar as informações desse link.`;

  const linhas = [`${emoji} **Avaliação do link Spotify:**`];
  if (dados.nome) linhas.push(`**Nome:** ${dados.nome}`);
  if (dados.artista) linhas.push(`**Artista:** ${dados.artista}`);
  if (dados.album) linhas.push(`**Álbum:** ${dados.album}`);
  if (dados.dono) linhas.push(`**Criado por:** ${dados.dono}`);
  if (dados.totalFaixas) linhas.push(`**Faixas:** ${dados.totalFaixas}`);
  if (dados.duracaoMs) {
    const min = Math.floor(dados.duracaoMs / 60000);
    const seg = Math.floor((dados.duracaoMs % 60000) / 1000);
    linhas.push(`**Duração:** ${min}:${String(seg).padStart(2, "0")}`);
  }
  const urlFinal = dados.url || url;
  linhas.push(`🔗 ${urlFinal}`);
  return linhas.join("\n");
}

module.exports = {
  nome: "musica",
  descricao: "Toca músicas no Spotify (desktop ou celular), avalia links do Spotify. Uso: skill_musica | [tocar <música> | celular <música> | avaliar <link>]",
  executar: async (args) => {
    let entrada;
    if (typeof args === "string") entrada = args.trim();
    else if (args && typeof args === "object") {
      const v = Object.values(args).find(Boolean);
      entrada = String(v || "").trim();
    }
    if (!entrada) return "❌ Uso: skill_musica | tocar <música/url> ou celular <música/url> ou avaliar <link Spotify>";

    const lower = entrada.toLowerCase();

    if (/^(?:no\s+|na\s+)?(?:celular|phone|mobile|app)\s+/i.test(entrada)) {
      const termo = entrada.replace(/^(?:no\s+|na\s+)?(?:celular|phone|mobile|app)\s+/i, "").trim();
      if (!termo) return "❌ Informe o nome da música ou cole o link.";
      try { return await tocarCelular(termo); }
      catch (e) { return `❌ Erro ao tocar no celular: ${e.message}`; }
    }

    if (/^(?:tocar|play|desktop)\s+/i.test(entrada)) {
      const termo = entrada.replace(/^(?:tocar|play|desktop)\s+/i, "").trim();
      if (!termo) return "❌ Informe o nome da música ou cole o link.";
      try { return await tocarDesktop(termo); }
      catch (e) { return `❌ Erro ao tocar no desktop: ${e.message}`; }
    }

    if (/^(?:avaliar|info|link|verificar)\s+/i.test(entrada)) {
      const url = entrada.replace(/^(?:avaliar|info|link|verificar)\s+/i, "").trim();
      if (!url) return "❌ Cole o link do Spotify que quer avaliar.";
      try { return await avaliarLink(url); }
      catch (e) { return `❌ Erro ao avaliar link: ${e.message}`; }
    }

    if (SPOTIFY_URL_RE.test(entrada) || SPOTIFY_URI_RE.test(entrada)) {
      try { return await avaliarLink(entrada); }
      catch (e) { return `❌ Erro ao avaliar link: ${e.message}`; }
    }

    try { return await tocarDesktop(entrada); }
    catch (e) { return `❌ Erro: ${e.message}`; }
  },
};