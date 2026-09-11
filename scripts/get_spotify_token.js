// Script pra obter o Spotify refresh_token via OAuth (Authorization Code + PKCE-like simples).
// 1. Registre http://localhost:8888/callback como Redirect URI no Dashboard do Spotify.
// 2. Rode: node get_spotify_token.js
// 3. Autorize no navegador. O token é salvo no .env (SPOTIFY_REFRESH_TOKEN).
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "f126d1d2389b4233bcfb9c0f7bdb95dd";
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "b67c9b94e6a14f56b120e4b5474fac1a";
const REDIRECT = "http://localhost:8888/callback";
const SCOPES = "user-read-playback-state,user-modify-playback-state,user-read-currently-playing";

const ENV_FILE = path.join(__dirname, "..", "..", ".env");

function salvarNoEnv(chave, valor) {
  try {
    let env = fs.readFileSync(ENV_FILE, "utf8");
    const re = new RegExp(`^${chave}=.*$`, "m");
    if (re.test(env)) env = env.replace(re, `${chave}=${valor}`);
    else env += `\n${chave}=${valor}\n`;
    fs.writeFileSync(ENV_FILE, env, "utf8");
    console.log(`\n✅ ${chave} salvo no .env`);
  } catch (err) {
    console.log(`\n⚠️ Não consegui salvar no .env (${err.message}). Copie manualmente:`);
    console.log(`${chave}=${valor}`);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  if (url.pathname !== "/callback") { res.writeHead(404); return res.end("not found"); }
  const code = url.searchParams.get("code");
  const erro = url.searchParams.get("error");

  if (erro) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<h2>Erro: ${erro}</h2><p>Verifique se a Redirect URI está certa no dashboard e tente de novo.</p>`);
    console.log("❌ Erro na autorização:", erro);
    server.close();
    process.exit(1);
    return;
  }
  if (!code) {
    res.writeHead(400); res.end("Sem code"); return;
  }

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });
    const resp = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await resp.json();
    if (!data.refresh_token) {
      throw new Error("Resposta sem refresh_token: " + JSON.stringify(data));
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h2>✅ Autorizado! Pode fechar esta aba.</h2>");
    console.log("\n✅ Refresh token obtido!");
    salvarNoEnv("SPOTIFY_REFRESH_TOKEN", data.refresh_token);
    console.log("Acess token expira em", data.expires_in, "s (auto-refresh pelo app).");
    server.close();
    process.exit(0);
  } catch (err) {
    console.log("❌ Falha ao trocar code:", err.message);
    server.close();
    process.exit(1);
  }
});

server.listen(8888, () => {
  const authUrl =
    `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}` +
    `&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT)}` +
    `&scope=${encodeURIComponent(SCOPES)}&show_dialog=true`;
  console.log("Abrindo navegador pra autorizar...");
  execFile("cmd", ["/c", "start", authUrl]);
  console.log("Servidor aguardando em http://localhost:8888/callback");
});