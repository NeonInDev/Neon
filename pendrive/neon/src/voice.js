const path = require("path");
const { log } = require("./logger");

let pagina = null;
let browser = null;
let ativo = false;
let ownerId = null;

let readyResolve = null;

const OPERA_PATH = "C:\\Users\\Pichau\\AppData\\Local\\Programs\\Opera GX\\opera.exe";
const USER_DATA = "C:\\Users\\Pichau\\AppData\\Local\\neon_voice_profile";

async function iniciar(id, username) {
  if (ativo) { log("INFO", "[VOICE] Já ativo"); return false; }
  ownerId = id;
  ativo = true;

  try {
    const puppeteer = require("puppeteer");
    browser = await puppeteer.launch({
      executablePath: OPERA_PATH,
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        `--user-data-dir=${USER_DATA}`,
        "--use-fake-ui-for-media-stream",
        "--allow-file-access-from-files",
        "--display-capture-permissions-policy-allowed",
      ],
    });

    pagina = await browser.newPage();
    pagina.on("console", (msg) => log("CHROME", `${msg.type()}: ${msg.text()}`));
    pagina.on("pageerror", (err) => log("CHROME", `pageerror: ${err.message}`));
    const pagePath = `file://${path.join(__dirname, "voice_page.html").replace(/\\/g, "/")}`;

    const readyPromise = new Promise((resolve) => {
      readyResolve = resolve;
      setTimeout(() => resolve(false), 12000);
    });

    pagina.exposeFunction("__neonSpeechReady2", (ok, msg) => {
      log(ok ? "INFO" : "WARN", ok ? "[VOICE] Web Speech API pronta" : "[VOICE] Web Speech API falhou", ok ? {} : { msg });
      if (readyResolve) { readyResolve(ok); readyResolve = null; }
    });

    pagina.exposeFunction("__neonSpeechCmd", async (texto) => {
      if (!texto || texto.length < 2) return;
      log("INFO", "[VOICE] Comando por voz", { texto: texto.slice(0, 80) });

      const m = texto.match(/^[Nn][Ee][Oo][Nn][,\s]\s*(.*)/);
      const cmd = m ? m[1].trim() : texto.trim();

      const pc = require("./pc");
      try { await pc.tts(`Entendido: ${cmd.slice(0, 60)}`); } catch {}

      try {
        const { executarAcao } = require("./actions");
        const resultado = await executarAcao(cmd, true, ownerId);
        if (resultado) {
          const limpo = resultado.replace(/[*_`~|#]/g, "").slice(0, 200);
          await pc.tts(limpo);
          return;
        }
      } catch (err) {
        log("WARN", "[VOICE] executarAcao falhou", { erro: err.message });
      }

      try {
        const { askNeon } = require("./ai");
        const reply = await askNeon(ownerId, "dono", cmd);
        const limpo = reply.replace(/[*_`~|#]/g, "").slice(0, 200);
        await pc.tts(limpo);
      } catch (err) {
        log("ERROR", "[VOICE] IA falhou", { erro: err.message });
        try { await pc.tts("Desculpe, não entendi."); } catch {}
      }
    });

    await pagina.goto(pagePath, { waitUntil: "domcontentloaded", timeout: 15000 });

    const ready = await readyPromise;
    if (!ready) {
      log("WARN", "[VOICE] Web Speech API nao iniciou (timeout/falha)");
      ativo = false;
      return false;
    }

    log("INFO", "[VOICE] Microfone ativo (Web Speech API)");
    return true;
  } catch (err) {
    log("WARN", "[VOICE] Falha ao iniciar", { erro: err.message });
    await parar();
    return false;
  }
}

async function parar() {
  if (pagina) {
    try { await pagina.evaluate(() => { window.__neonListening = false; }); } catch {}
  }
  if (browser) {
    try { await browser.close(); } catch {}
  }
  pagina = null;
  browser = null;
  ativo = false;
  log("INFO", "[VOICE] Microfone desativado");
  return true;
}

function status() {
  return { ativo, ownerId };
}

module.exports = { iniciar, parar, status };
