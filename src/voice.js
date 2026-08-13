const path = require("path");
const fs = require("fs");
const { log } = require("./logger");

function pcmParaWav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

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
    const { chromium } = require("playwright");
    browser = await chromium.launch({
      executablePath: OPERA_PATH,
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        `--user-data-dir=${USER_DATA}`,
        "--use-fake-ui-for-media-stream",
        "--allow-file-access-from-files",
        "--window-position=-32000,0",
        "--window-size=800,600",
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
      log(ok ? "INFO" : "WARN", ok ? "[VOICE] Microfone + transcricao prontos" : "[VOICE] Captura de audio falhou", ok ? {} : { msg });
      if (readyResolve) { readyResolve(ok); readyResolve = null; }
    });

    let pcmChunks = [];
    let processando = false;

    pagina.exposeFunction("__neonAudioChunk", async (uint8) => {
      if (!uint8 || !uint8.byteLength) return;
      pcmChunks.push(Buffer.from(uint8));
    });

    pagina.exposeFunction("__neonAudioEnd", async () => {
      if (processando || pcmChunks.length === 0) return;
      const buf = Buffer.concat(pcmChunks);
      pcmChunks = [];
      await processarAudio(buf);
    });

    pagina.exposeFunction("__neonAudioReset", async () => {
      pcmChunks = [];
    });

    async function processarAudio(buf) {
      processando = true;
      const tmp = process.env.TEMP || "C:\\Temp";
      const wavPath = path.join(tmp, `neon_voice_${Date.now()}.wav`);
      try {
        fs.writeFileSync(wavPath, pcmParaWav(buf, 16000));
        const { transcreverAudio } = require("./voz");
        const texto = await transcreverAudio(wavPath);
        log("INFO", "[VOICE] Transcricao", { texto: (texto || "").slice(0, 80) });
        if (!texto || texto.length < 2) return;
        const cmd = texto.replace(/^[Nn][Ee][Oo][Nn][,\s:!.\-–—]*\s*/, "").trim() || "oi";
        await processarComando(cmd);
      } catch (err) {
        log("WARN", "[VOICE] Falha no audio", { erro: err.message });
      } finally {
        try { fs.unlinkSync(wavPath); } catch {}
        processando = false;
      }
    }

    async function processarComando(cmd) {
      const pc = require("./pc");
      try { await pagina.evaluate(() => { window.__neonMuted = true; }); } catch {}
      try {
        try {
          const { executarAcao } = require("./actions");
          const resultado = await executarAcao(cmd, true, ownerId);
          if (resultado) {
            const limpo = resultado.replace(/[*_`~|#\[\]]/g, "").slice(0, 200);
            await pc.tts(limpo);
            return;
          }
        } catch (err) {
          log("WARN", "[VOICE] executarAcao falhou", { erro: err.message });
        }
        try {
          const { askNeon } = require("./ai");
          const reply = await askNeon(ownerId, "dono", cmd);
          const limpo = reply.replace(/[*_`~|#\[\]]/g, "").slice(0, 200);
          await pc.tts(limpo);
        } catch (err) {
          log("ERROR", "[VOICE] IA falhou", { erro: err.message });
          try { await pc.tts("Desculpe, não entendi."); } catch {}
        }
      } finally {
        try { await pagina.evaluate(() => { window.__neonMuted = false; }); } catch {}
      }
    }

    await pagina.goto(pagePath, { waitUntil: "domcontentloaded", timeout: 15000 });

    const ready = await readyPromise;
    if (!ready) {
      log("WARN", "[VOICE] Microfone nao iniciou (timeout/falha)");
      await parar();
      return false;
    }

    log("INFO", "[VOICE] Microfone ativo (STT Groq whisper)");
    return true;
  } catch (err) {
    log("WARN", "[VOICE] Falha ao iniciar", { erro: err.message });
    await parar();
    return false;
  }
}

async function parar() {
  if (pagina) {
    try { await pagina.evaluate(() => { window.__neonListening = false; window.__neonMuted = false; }); } catch {}
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
