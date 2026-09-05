// spotify_auth.js
// Assistente de autorização para o Spotify Web API (cross-device da Neon).
//
// Uso:  node spotify_auth.js
//  1) Mostra a URL de autorização e abre no navegador.
//  2) Você faz login no Spotify e autoriza.
//  3) O navegador redireciona para http://localhost:8888/callback (este script
//     captura sozinho) e troca o código pelo refresh token.
//  4) Imprime as 3 linhas prontas para o arquivo .env da Neon.
//
// REQUISITOS: ter criado um app em https://developer.spotify.com/dashboard
// com Redirect URI: http://localhost:8888/callback
// E a conta de usuário do Spotify PRECISA ser PREMIUM (playback via API exige).

const http = require("http")
const { exec } = require("child_process")

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET
const REDIRECT = "http://localhost:8888/callback"
const SCOPES = "user-read-playback-state user-modify-playback-state user-read-currently-playing streaming"

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.log("Defina SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no .env primeiro.")
  console.log("Mande: node spotify_auth.js <client_id> <client_secret>  (sem tocar no .env)")
  if (process.argv.length >= 4) {
    process.env.SPOTIFY_CLIENT_ID = process.argv[2]
    process.env.SPOTIFY_CLIENT_SECRET = process.argv[3]
  } else {
    process.exit(1)
  }
}

const url = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=${encodeURIComponent(SCOPES)}`

console.log("\n=== SPOTIFY - AUTORIZAÇÃO ===\n")
console.log("1) Navegador vai abrir. Faça login no Spotify e clique em 'Concordo'.")
console.log("2) Aguarde... este script captura a volta sozinho.\n")

try { exec(`start "" "${url}"`) } catch {}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost:8888")
  if (u.pathname !== "/callback") { res.writeHead(404); res.end(); return }

  const code = u.searchParams.get("code")
  const erro = u.searchParams.get("error")
  if (erro || !code) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    res.end(`<h3>Erro na autorização: ${erro || "sem código"}</h3><p>Feche esta aba e rode de novo.</p>`)
    process.exit(1)
    return
  }

  // Troca o code pelo refresh token
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  })

  try {
    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
    const data = await r.json()
    if (!r.ok || !data.refresh_token) {
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" })
      res.end(`<h3>Erro ao trocar o código</h3><pre>${JSON.stringify(data, null, 2)}</pre>`)
      return
    }

    const linhas = [
      `SPOTIFY_CLIENT_ID=${CLIENT_ID}`,
      `SPOTIFY_CLIENT_SECRET=${CLIENT_SECRET}`,
      `SPOTIFY_REFRESH_TOKEN=${data.refresh_token}`,
    ]
    console.log("\n=== PRONTO! Cole estas 3 linhas no SEU .env da Neon ===\n")
    console.log(linhas.join("\n"))
    console.log("\nDepois reinicie a Neon. Pronto: 'tocar tal música no meu celular' funciona.\n")

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    res.end("<h3>Autorização completa!</h3><p>Pode fechar esta aba.</p>")
    server.close(() => process.exit(0))
  } catch (err) {
    res.writeHead(500)
    res.end("Erro: " + err.message)
  }
})

server.listen(8888, () => {
  console.log("Servidor de retorno em http://localhost:8888 ...")
})