// Login único no Strava com perfil persistente da Neon.
// Rode UMA VEZ: node scripts/strava_conta.js
// Faça login com Google na janela que abrir, depois pode fechar.
// A sessão fica salva em .strava_perfil/ (ignorada pelo git).

const path = require("path");
const puppeteer = require("puppeteer");

const PERFIL = path.join(__dirname, "..", ".strava_perfil");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: EDGE,
    userDataDir: PERFIL,
    args: ["--no-sandbox", "--window-size=1100,800", "--window-position=60,60"],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.goto("https://www.strava.com/login", { waitUntil: "domcontentloaded" });

  console.log("🔑 Janela aberta — faça login com o Google.");
  console.log("   Quando terminar (aparecer seu feed), feche a janela ou aperte Ctrl+C aqui.");

  const checar = setInterval(async () => {
    try {
      const url = page.url();
      if (/strava\.com\/(dashboard|athletes|training|settings)/.test(url)) {
        console.log("✅ Login detectado! Sessão salva. Pode fechar a janela.");
        clearInterval(checar);
        await new Promise((r) => setTimeout(r, 1500));
        await browser.close();
        process.exit(0);
      }
    } catch {}
  }, 2000);

  browser.on("disconnected", () => {
    clearInterval(checar);
    console.log("Janela fechada.");
    process.exit(0);
  });
})();
