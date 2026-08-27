require("dotenv").config();
const path = require("path");
const fs = require("fs");
const os = require("os");
const readline = require("readline");
const { spawn, exec } = require("child_process");
const axios = require("axios");

const { MASTER_KEY } = require("./src/config");
const { OWNER } = require("./src/perm");

const API = process.env.TUI_API || "http://127.0.0.1:3000";
const KEY = MASTER_KEY;
const TEMP = path.join(os.tmpdir(), "neon_tui");
const HIST_FILE = path.join(os.homedir(), ".neon_tui_history");

fs.mkdirSync(TEMP, { recursive: true });

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

let vozAtiva = false;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  historySize: 200,
  terminal: true,
  prompt: "",
});

if (fs.existsSync(HIST_FILE)) {
  const linhas = fs.readFileSync(HIST_FILE, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  rl.history.push(...linhas.slice(-200));
}

function print(texto) {
  process.stdout.write(texto + "\n");
}

function printUser(texto) {
  print(`${C.magenta}${C.bold}voce▸${C.reset} ${texto}`);
}

function printNeon(texto) {
  print(`${C.cyan}${C.bold}Neon▸${C.reset} ${texto.replace(/^```|```$/g, "").trim()}`);
}

function printSys(texto, cor = C.gray) {
  print(`${cor}${C.dim}${texto}${C.reset}`);
}

function banner() {
  const arte = [
    `${C.cyan}    ███╗   ██╗███████╗ ██████╗ ███╗   ██╗${C.reset}`,
    `${C.cyan}    ████╗  ██║██╔════╝██╔═══██╗████╗  ██║${C.reset}`,
    `${C.cyan}    ██╔██╗ ██║█████╗  ██║   ██║██╔██╗ ██║${C.reset}`,
    `${C.cyan}    ██║╚██╗██║██╔══╝  ██║   ██║██║╚██╗██║${C.reset}`,
    `${C.cyan}    ██║ ╚████║███████╗╚██████╔╝██║ ╚████║${C.reset}`,
    `${C.cyan}    ╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝${C.reset}`,
    "",
    `${C.dim}    TUI 2.0 — conversa com voz (TTS + STT)${C.reset}`,
  ];
  print(arte.join("\n"));
  print(`    ${C.gray}API: ${API}   |   ${C.gray}teclas: ${C.cyan}v${C.gray} falar   ${C.cyan}/voz${C.gray} TTS   ${C.cyan}/sair${C.gray} sair${C.reset}`);
  print("");
}

function ajuda() {
  print("");
  print(`${C.bold}Comandos:${C.reset}`);
  print(`  ${C.cyan}v${C.reset}          falar (grava ate dar Enter)`);
  print(`  ${C.cyan}/voz${C.reset}       liga/desliga resposta falada (TTS)`);
  print(`  ${C.cyan}/ajuda${C.reset}     mostra isso`);
  print(`  ${C.cyan}/sair${C.reset}      sai do TUI`);
  print("");
}

async function ping() {
  try {
    const r = await axios.get(`${API}/api/status`, { timeout: 5000 });
    if (r.data?.status === "online") printSys("Neon online. Pronto pra conversar.", C.green);
    else printSys("Neon respondeu, mas estado inesperado.", C.yellow);
  } catch {
    printSys("Nao consegui falar com a Neon. Confira se ela esta de pe (porta 3000).", C.red);
  }
}

async function enviar(texto) {
  printUser(texto);
  try {
    const r = await axios.post(
      `${API}/api/chat`,
      { mensagem: texto, usuario: "Dono", userId: String(OWNER) },
      { headers: { "x-hud-key": KEY }, timeout: 120000 }
    );
    const reply = (r.data?.resposta || "(sem resposta)").trim();
    printNeon(reply);
    if (vozAtiva && reply !== "(sem resposta)") await tocarResposta(reply);
  } catch (err) {
    printSys("Falha ao falar com a Neon: " + (err.response?.data?.erro || err.message), C.red);
  }
}

function detectarMic() {
  if (process.env.MIC_DEVICE) return Promise.resolve(process.env.MIC_DEVICE);
  const ff = require("ffmpeg-static");
  return new Promise((resolve) => {
    exec(`"${ff}" -list_devices true -f dshow -i dummy 2>&1`, { timeout: 10000, windowsHide: true }, (err, stdout) => {
      if (!stdout) return resolve(null);
      const mics = [...stdout.matchAll(/"([^"]+)"\s*\(audio\)/g)].map((m) => m[1]);
      const pref = mics.find((n) => /mic/i.test(n)) || mics[0];
      resolve(pref || null);
    });
  });
}

function gravarMic(device, saida) {
  const ff = require("ffmpeg-static");
  return spawn(ff, ["-f", "dshow", "-i", `audio=${device}`, "-ar", "16000", "-ac", "1", "-sample_fmt", "s16", saida, "-y"], {
    windowsHide: true,
    stdio: "ignore",
  });
}

function tocarMp3(arquivo) {
  return new Promise((resolve) => {
    const cmd = `powershell -NoProfile -Command "$w = New-Object -ComObject WMPlayer.OCX; $w.settings.volume = 100; $w.URL = '${arquivo}'; $w.controls.play(); while ($w.playState -eq 3) { Start-Sleep -Milliseconds 150 }; $w.close()"`;
    exec(cmd, { timeout: 60000, windowsHide: true }, () => resolve());
  });
}

async function tocarResposta(texto) {
  const limpo = texto.replace(/[*_`~#|\[\]]/g, "").slice(0, 500);
  if (!limpo.trim()) return;
  try {
    const r = await axios.post(
      `${API}/api/voz/audio`,
      { texto: limpo },
      { headers: { "x-hud-key": KEY }, responseType: "arraybuffer", timeout: 45000 }
    );
    if (r.status !== 200 || !r.data?.length) return;
    const mp3 = path.join(TEMP, `tts_${Date.now()}.mp3`);
    fs.writeFileSync(mp3, r.data);
    await tocarMp3(mp3);
    try { fs.unlinkSync(mp3); } catch {}
  } catch {
    printSys("TTS falhou (resposta so no texto).", C.yellow);
  }
}

async function falar() {
  const mic = await detectarMic();
  if (!mic) {
    printSys("Microfone nao encontrado (ffmpeg dshow). Sete MIC_DEVICE no .env.", C.red);
    return;
  }
  printSys(`Gravando (${mic})... aperte Enter pra parar.`);
  const wav = path.join(TEMP, `mic_${Date.now()}.wav`);
  const proc = gravarMic(mic, wav);
  await new Promise((res) => rl.question("", res));
  proc.kill();
  await new Promise((res) => proc.once("exit", res));
  await new Promise((res) => setTimeout(res, 400));

  if (!fs.existsSync(wav) || fs.statSync(wav).size < 300) {
    printSys("Audio muito curto, ignora.", C.yellow);
    try { fs.unlinkSync(wav); } catch {}
    return;
  }

  try {
    const r = await axios.post(`${API}/api/voz/stt`, fs.readFileSync(wav), {
      headers: { "Content-Type": "audio/wav", "x-hud-key": KEY },
      timeout: 120000,
    });
    const texto = (r.data?.texto || "").trim();
    if (!texto) printSys("Nao consegui entender o audio.", C.yellow);
    else await enviar(texto);
  } catch (err) {
    printSys("STT falhou: " + (err.response?.data?.erro || err.message), C.red);
  } finally {
    try { fs.unlinkSync(wav); } catch {}
  }
}

function loop() {
  rl.question(`${C.cyan}${C.bold}Neon▸${C.reset} `, async (linha) => {
    const t = (linha || "").trim();
    if (!t) return loop();
    if (t === "/sair" || t === "/quit" || t === "exit") return sair();
    if (t === "/voz") {
      vozAtiva = !vozAtiva;
      printSys(`Resposta falada: ${vozAtiva ? "ligada" : "desligada"}.`, vozAtiva ? C.green : C.yellow);
      return loop();
    }
    if (t === "/ajuda" || t === "ajuda" || t === "help") {
      ajuda();
      return loop();
    }
    if (t === "v" || t === "/v" || t === "falar") {
      await falar();
      return loop();
    }
    await enviar(t);
    loop();
  });
}

function sair() {
  try {
    const linhas = [...new Set(rl.history.map((l) => l.trim()).filter(Boolean))];
    fs.writeFileSync(HIST_FILE, linhas.slice(-200).join("\n"));
  } catch {}
  print("");
  printSys("Até mais.");
  process.exit(0);
}

banner();
ping();
loop();
