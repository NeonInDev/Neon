/*
 * Google OAuth setup — Neon
 *
 * 1) Crie as credenciais em Google Cloud Console:
 *    console.cloud.google.com → APIs & Services → Credentials
 *    → Create OAuth client ID → Desktop app (ou Web)
 *    -> redirect URI: http://localhost:8787
 *    Baixe o JSON e salve como google_credentials.json na pasta da Neon.
 *
 * 2) Rode:  node google_oauth_setup.js
 *    Abra a URL, autorize, e o token é salvo em google_token.json.
 */
require("dotenv").config();
const http = require("http");
const { log } = require("./src/logger");
const google = require("./src/google");

(async () => {
  const st = await google.status();

  if (!st.credentialsExists) {
    console.error("❌ google_credentials.json nao encontrado.");
    console.error(`   Crie o OAuth Client e salve em: ${google.CREDENTIALS_PATH}`);
    console.error("   Instrucoes: README.md (secao Google)");
    process.exit(1);
  }

  const url = google.getAuthUrl();
  if (!url) {
    console.error("❌ Nao consegui gerar a URL de autenticacao.");
    process.exit(1);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔐 Google OAuth — Neon");
  console.log(`   Porta: ${google.PORT}`);
  console.log(`   Redirect: ${google.REDIRECT_URI}`);
  console.log("   Escopos: calendar, tasks, gmail(readonly), drive");
  console.log("");
  console.log("👉 Abra esta URL no navegador e autorize:");
  console.log("");
  console.log("   " + url);
  console.log("");
  console.log("   Aguardando retorno do Google em http://localhost:" + google.PORT + " ...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    const server = http.createServer(async (req, res) => {
      const q = new URL(req.url, "http://localhost").searchParams;
      const code = q.get("code");
      const erro = q.get("error");
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(erro ? `Erro: ${erro}` : "Sem code na URL.");
        return;
      }
      try {
        await google.exchangeCode(code);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h3>✅ Neon autenticada com sucesso! Pode fechar esta aba.</h3>");
        console.log("✅ Autenticado! Token salvo.");
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Erro ao trocar o code: " + err.message);
        console.error("❌ Erro:", err.message);
      }
      server.close(() => process.exit(0));
    });

    server.listen(google.PORT, () => {});
  } catch (err) {
    console.error("❌ Nao consegui subir o servidor:", err.message);
    process.exit(1);
  }
})();
