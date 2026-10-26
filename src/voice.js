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
let wakeOnly = false;
let wakeLaunchPending = false;
let lastWakeAt = 0;

let readyResolve = null;

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA = path.join(__dirname, "..", ".neon-opencode", "voice-profile");

async function iniciar(id, username, options = {}) {
  if (ativo) { log("INFO", "[VOICE] Já ativo"); return false; }
  ownerId = id;
  wakeOnly = options.wakeOnly === true;
  ativo = true;

  try {
    const { chromium } = require("playwright");
    fs.mkdirSync(USER_DATA, { recursive: true });
    browser = await chromium.launchPersistentContext(USER_DATA, {
      executablePath: EDGE_PATH,
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--use-fake-ui-for-media-stream",
        "--allow-file-access-from-files",
        "--window-position=-32000,-32000",
        "--window-size=800,600",
      ],
    });
    browser.on("close", () => {
      if (ativo) {
        ativo = false;
        log("WARN", "[VOICE-WAKE] Navegador do microfone desconectou; o ouvinte será reiniciado");
      }
    });

    pagina = await browser.newPage();
    pagina.on("console", (msg) => log("CHROME", `${msg.type()}: ${msg.text()}`));
    pagina.on("pageerror", (err) => log("CHROME", `pageerror: ${err.message}`));
    const pagePath = `file://${path.join(__dirname, "voice_page.html").replace(/\\/g, "/")}`;

    const readyPromise = new Promise((resolve) => {
      readyResolve = resolve;
      setTimeout(() => resolve(false), 30000);
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
        if (wakeOnly) {
          if (ehFraseDeploy(texto)) {
            await ativarNeon();
            wakeOnly = false;
            await falarLocal("Neon ligada. Pode falar comigo.");
            log("INFO", "[VOICE] Modo de conversa por voz ativado");
          } else {
            log(texto ? "DEBUG" : "WARN", texto ? "[VOICE-WAKE] Fala transcrita sem a frase de ativação" : "[VOICE-WAKE] Não consegui transcrever o trecho de áudio", {
              caracteres: String(texto || "").length,
            });
          }
          return;
        }
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

    async function falarLocal(texto) {
      const pc = require("./pc");
      try { await pagina.evaluate(() => { window.__neonMuted = true; }); } catch {}
      try {
        await pc.tts(texto);
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

    log("INFO", wakeOnly ? "[VOICE-WAKE] Microfone de ativacao ativo" : "[VOICE] Microfone ativo (STT Groq whisper)");
    return true;
  } catch (err) {
    log("WARN", "[VOICE] Falha ao iniciar", { erro: err.message });
    await parar();
    return false;
  }
}

function ehFraseDeploy(texto) {
  const normalizado = String(texto || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return /^(?:(?:hey|ei|oi|ola)\s+)?neon\s+de\s*ploy$/.test(normalizado);
}

async function ativarNeon() {
  if (wakeLaunchPending || Date.now() - lastWakeAt < 30_000) return;
  wakeLaunchPending = true;
  lastWakeAt = Date.now();
  try {
    const { spawn } = require("child_process");
    const root = path.resolve(__dirname, "..");
    const script = path.join(root, "start_neon.ps1");
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], {
      cwd: root, detached: true, windowsHide: true, stdio: "ignore",
    });
    child.once("error", (err) => log("ERROR", "[VOICE-WAKE] Falha ao iniciar Neon", { erro: err.message }));
    child.unref();
    log("INFO", "[VOICE-WAKE] Frase Neon deploy reconhecida; iniciando bot");
  } catch (err) {
    log("ERROR", "[VOICE-WAKE] Falha ao iniciar Neon", { erro: err.message });
  } finally {
    setTimeout(() => { wakeLaunchPending = false; }, 10_000).unref?.();
  }
}

async function parar() {
  ativo = false;
  if (pagina) {
    try { await pagina.evaluate(() => { window.__neonListening = false; window.__neonMuted = false; }); } catch {}
  }
  if (browser) {
    try { await browser.close(); } catch {}
  }
  pagina = null;
  browser = null;
  wakeOnly = false;
  log("INFO", "[VOICE] Microfone desativado");
  return true;
}

function status() {
  return { ativo, ownerId };
}

module.exports = { iniciar, parar, status, ehFraseDeploy };
