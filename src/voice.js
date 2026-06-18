const path = require("path");
const { log } = require("./logger");
const pc = require("./pc");

let pagina = null;
let browser = null;
let ativo = false;
let ownerId = null;
let ownerUsername = "dono";

async function iniciar(id, username) {
  if (ativo) return false;
  ownerId = id;
  ownerUsername = username || "dono";

  try {
    const puppeteer = require("puppeteer");
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--use-fake-ui-for-media-stream",
        "--allow-file-access-from-files",
      ],
    });
    pagina = await browser.newPage();
    const pagePath = `file://${path.join(__dirname, "voice_page.html").replace(/\\/g, "/")}`;

    // Ready promise: espera a pagina falar se o speech recognition funcionou
    const ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout")), 15000);
      pagina.exposeFunction("__neonSpeechReady", (ok, msg) => {
        clearTimeout(timeout);
        if (ok) resolve();
        else reject(new Error(msg));
      });
    });

    // Handler pra comandos de voz
    pagina.exposeFunction("__neonSpeechCmd", async (texto) => {
      if (!texto || texto.length < 2) return;
      log("INFO", "[VOICE] Comando por voz (Web Speech)", { texto });
      // Verifica se comeca com "neon"
      const m = texto.match(/^[Nn][Ee][Oo][Nn][,\s]\s*(.*)/);
      const cmd = m ? m[1].trim() : texto.trim();

      try {
        await pc.tts(`Entendido: ${cmd.slice(0, 60)}`);
      } catch {}

      try {
        const { executarAcao } = require("./actions");
        const resultado = await executarAcao(cmd, true, ownerId);
        if (resultado) {
          const limpo = resultado.replace(/[*_`~|#]/g, "").slice(0, 200);
          await pc.tts(limpo);
          if (global.__neonVoiceCb) global.__neonVoiceCb(cmd, resultado);
          return;
        }
      } catch (err) {
        log("WARN", "[VOICE] executarAcao falhou", { erro: err.message });
      }

      try {
        const { askNeon } = require("./ai");
        const reply = await askNeon(ownerId, ownerUsername, cmd);
        const limpo = reply.replace(/[*_`~|#]/g, "").slice(0, 200);
        await pc.tts(limpo);
        if (global.__neonVoiceCb) global.__neonVoiceCb(cmd, limpo);
      } catch (err) {
        log("ERROR", "[VOICE] IA falhou", { erro: err.message });
        try { await pc.tts("Desculpe, não entendi."); } catch {}
      }
    });

    await pagina.goto(pagePath, { waitUntil: "domcontentloaded", timeout: 15000 });
    await ready;
    ativo = true;
    log("INFO", "[VOICE] Microfone ativado (Web Speech API via Chromium)");
    return true;
  } catch (err) {
    log("WARN", "[VOICE] Falha ao iniciar microfone via Puppeteer", { erro: err.message });
    await parar();
    return false;
  }
}

async function parar() {
  if (pagina) {
    try {
      await pagina.evaluate(() => { window.__neonListening = false; });
    } catch {}
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

function onComando(fn) {
  global.__neonVoiceCb = fn;
}

module.exports = { iniciar, parar, status, onComando };
