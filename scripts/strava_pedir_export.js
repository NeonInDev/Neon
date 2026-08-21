// Pede o export oficial de dados na Strava automaticamente.
// Usa um perfil próprio do Edge (.strava_perfil) — o login persiste depois da primeira vez.
//
// Primeira vez:  node scripts/strava_conta.js   → abre o Strava pra você logar com Google
// Depois:        node scripts/strava_pedir_export.js → clica em "solicitar arquivo" sozinho

const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer");

const PERFIL = path.join(__dirname, "..", ".strava_perfil");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

(async () => {
  if (!fs.existsSync(PERFIL)) {
    console.log("❌ Você ainda não logou no Strava pela Neon.");
    console.log("   Rode primeiro: node scripts/strava_conta.js");
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: EDGE,
    userDataDir: PERFIL,
    args: ["--no-sandbox", "--window-size=1100,800"],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());

  try {
    await page.goto("https://www.strava.com/settings", { waitUntil: "networkidle2", timeout: 60000 });

    const url = page.url();
    if (/login|signin|session/i.test(url)) {
      console.log("❌ Sessão expirou. Rode: node scripts/strava_conta.js");
      await browser.close();
      process.exit(1);
    }

    // A página de configurações tem a seção "Baixe seus dados" no fim.
    const alvo = await page.evaluate(() => {
      const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
      const cands = [...document.querySelectorAll("button, a.btn, [role='button'], input[type='submit']")];
      const alvoEl = cands.find((b) =>
        /request.*archive|solicitar.*arquivo|baixe seus dados|download.*data/i.test(
          `${norm(b.textContent)} ${norm(b.getAttribute("aria-label") || "")}`
        )
      );
      if (!alvoEl) return null;
      alvoEl.scrollIntoView({ block: "center" });
      const r = alvoEl.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, texto: String(alvoEl.textContent).trim() };
    });

    if (!alvo) {
      console.log("❌ Botão de export não encontrado na página de configurações.");
      console.log("   A Strava pode ter mudado o layout — tire um print e me mande.");
      await browser.close();
      process.exit(1);
    }

    await page.mouse.click(alvo.x, alvo.y);
    await new Promise((r) => setTimeout(r, 2500));

    // Confirmação pode aparecer num modal
    const confirmou = await page.evaluate(() => {
      const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
      const btn = [...document.querySelectorAll("button, [role='button']")].find((b) =>
        /^(ok|confirmar|confirm|enviar|submit)$/.test(norm(b.textContent))
      );
      if (!btn) return false;
      const r = btn.getBoundingClientRect();
      btn.dataset.neonClique = "1";
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (confirmou && confirmou.x) {
      await page.mouse.click(confirmou.x, confirmou.y);
      await new Promise((r) => setTimeout(r, 1500));
    }

    console.log(`✅ Cliquei em "${alvo.texto}". A Strava vai enviar o zip pro seu e-mail.`);
    console.log("   Quando chegar, baixa e extrai dentro de C:\\Users\\Pichau\\neon\\strava_export\\");
    await new Promise((r) => setTimeout(r, 4000));
    await browser.close();
  } catch (err) {
    console.error("❌", err.message);
    try { await browser.close(); } catch {}
    process.exit(1);
  }
})();
