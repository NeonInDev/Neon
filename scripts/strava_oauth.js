// Fluxo OAuth do Strava — gera o STRAVA_REFRESH_TOKEN para o .env
//
// Uso (2 etapas):
//   1) node scripts/strava_oauth.js                → mostra a URL de autorização
//   2) Autorize no navegador, copie o "code=XXXX" da URL final e rode:
//      node scripts/strava_oauth.js XXXX           → imprime o refresh token
//
// Requer STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET no .env.

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ Preencha STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET no .env primeiro.");
  process.exit(1);
}

const ESCOPO = "read,activity:read_all,profile:read_all";

async function main() {
  const codigo = process.argv[2];

  if (!codigo) {
    const url =
      `https://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}` +
      `&response_type=code&redirect_uri=http://localhost/exchange_token` +
      `&approval_prompt=force&scope=${ESCOPO}`;
    console.log("\n1) Abra esta URL no navegador e autorize:\n");
    console.log(url);
    console.log("\n2) Depois de autorizar, você será 'redirecionado' para localhost (vai dar erro de página, é normal).");
    console.log("   Copie o valor do parâmetro code= da barra de endereço e rode:");
    console.log("   node scripts/strava_oauth.js SEU_CODE\n");
    return;
  }

  try {
    const r = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: codigo,
        grant_type: "authorization_code",
      }),
    });
    const j = await r.json();
    if (!r.ok || j.errors) {
      console.error("❌ Erro ao trocar o código:", JSON.stringify(j).slice(0, 400));
      process.exit(1);
    }
    console.log("\n✅ Funcionou! Adicione esta linha ao .env:\n");
    console.log(`STRAVA_REFRESH_TOKEN=${j.refresh_token}`);
    console.log(`\n(atleta: ${j.athlete?.firstname || "?"} ${j.athlete?.lastname || ""})\n`);
  } catch (err) {
    console.error("❌ Falha na requisição:", err.message);
    process.exit(1);
  }
}

main();
