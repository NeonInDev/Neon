const { log } = require("./logger");
const { exec: execCb, execSync, spawn } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const execAsync = promisify(execCb);

const CONFIG_PATH = path.join(__dirname, "..", "celular_config.json");
let config = {
  ip: "192.168.1.100",
  porta: 5555,
  adb: "",
  scrcpy: "",
};

function carregarConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8").replace(/^\uFEFF/, "")) };
  } catch {}
}
carregarConfig();

function salvarConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function acharAdb() {
  if (config.adb && fs.existsSync(config.adb)) return config.adb;
  const candidatos = [
    "C:\\Users\\Pichau\\Android\\platform-tools\\adb.exe",
    `${process.env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools\\adb.exe`,
    `${process.env.USERPROFILE}\\Android\\platform-tools\\adb.exe`,
  ];
  for (const c of candidatos) if (fs.existsSync(c)) return c;
  try {
    const r = execSync("where adb", { timeout: 3000, windowsHide: true });
    const p = r.toString().trim().split("\n")[0];
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return "adb";
}

function acharScrcpy() {
  if (config.scrcpy && fs.existsSync(config.scrcpy)) return config.scrcpy;
  try {
    const r = execSync("where scrcpy", { timeout: 3000, windowsHide: true });
    const p = r.toString().trim().split("\n")[0];
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return "scrcpy";
}

function dispositivo() {
  return config.ip ? `${config.ip}:${config.porta}` : null;
}

let alvoSelecionado = null;

async function rodar(args, timeout = 20000) {
  const adb = acharAdb();
  try {
    const { stdout, stderr } = await execAsync(`"${adb}" ${args}`, { timeout, windowsHide: true });
    return { ok: true, stdout: (stdout || "").trim(), stderr: (stderr || "").trim() };
  } catch (err) {
    return { ok: false, stdout: (err.stdout || "").trim(), stderr: (err.stderr || "").trim() || err.message };
  }
}

async function status() {
  const r = await rodar("devices -l", 10000);
  const lista = (r.stdout || "").split("\n").slice(1).map((l) => l.trim()).filter(Boolean);
  const disp = dispositivo();
  const conectado = lista.some((l) => l.startsWith(disp));
  alvoSelecionado = conectado ? disp : (lista[0]?.split(/\s+/)[0] || null);
  return {
    ip: config.ip,
    porta: config.porta,
    dispositivo: disp,
    conectado,
    device: alvoSelecionado,
    saida: r.stdout,
  };
}

async function garantirAlvo() {
  if (!alvoSelecionado) await status();
  if (!alvoSelecionado) throw new Error("nenhum dispositivo adb conectado");
  return alvoSelecionado;
}

async function rodarAlvo(args, timeout = 20000) {
  const alvo = await garantirAlvo();
  return rodar(`-s "${alvo}" ${args}`, timeout);
}

async function conectar() {
  if (!config.ip) return { ok: false, msg: "IP do celular não configurado. Use: Neon, celular ip 192.168.x.x" };
  const r = await rodar(`connect ${config.ip}:${config.porta}`, 15000);
  const saida = r.stdout || r.stderr;
  if (saida.includes("connected")) {
    log("INFO", "[CELULAR] Conectado via adb", { alvo: `${config.ip}:${config.porta}` });
    await status();
    return { ok: true, msg: `✅ Celular conectado (${config.ip}:${config.porta}).` };
  }
  return { ok: false, msg: `❌ Não conectou (${config.ip}:${config.porta}): ${saida}. Ative a depuração USB e aceite a permissão no celular.` };
}

async function desconectar() {
  const r = await rodar(`disconnect ${config.ip}:${config.porta}`, 10000);
  return { ok: r.ok, msg: "🔌 Celular desconectado." };
}

function espelhar() {
  const scrcpy = acharScrcpy();
  const disp = dispositivo();
  try {
    const p = spawn(scrcpy, disp ? ["-s", disp] : [], { detached: true, stdio: "ignore", windowsHide: true });
    p.unref();
    log("INFO", "[CELULAR] Espelho aberto (scrcpy)", { scrcpy });
    return { ok: true, msg: `📱 Abrindo o espelho do celular${disp ? ` (${disp})` : ""}. Feche a janela pra encerrar.` };
  } catch (err) {
    return { ok: false, msg: `❌ Erro ao abrir scrcpy: ${err.message}` };
  }
}

async function abrirApp(pacote) {
  const r = await rodarAlvo(`shell monkey -p ${pacote} -c android.intent.category.LAUNCHER 1`, 15000);
  if (r.ok && !/error|exception|not\s+found/i.test(r.stdout + r.stderr)) {
    return { ok: true, msg: `📱 Abri o app (${pacote}).` };
  }
  const r2 = await rodarAlvo(`shell am start -n ${pacote}`, 15000);
  if (r2.ok) return { ok: true, msg: `📱 Abri o app (${pacote}).` };
  return { ok: false, msg: `❌ Não abri o app: ${r2.stderr || r2.stdout}` };
}

const mapaTeclas = {
  home: 3, inicio: 3,
  volta: 4, voltar: 4, back: 4,
  apps: 187, recentes: 187, menu: 187, recent: 187,
  power: 26, liga: 26, bloqueia: 26,
  volume_up: 24, "volume+": 24, aumentar: 24,
  volume_down: 25, "volume-": 25, diminuir: 25,
  silencia: 164, mute: 164,
  enter: 66, ok: 23, seleciona: 23, center: 23,
  espaco: 62, espaco: 62, tab: 61,
  apagar: 67, del: 67, backspace: 67,
  cima: 19, up: 19, baixo: 20, down: 20, esquerda: 21, left: 21, direita: 22, right: 22,
  notificacoes: 40, notification: 40,
};

async function tecla(nome) {
  const key = mapaTeclas[String(nome || "").toLowerCase()];
  if (!key) return { ok: false, msg: `Tecla desconhecida: ${nome}. Tenta: home, voltar, apps, power, volume_up, silencia.` };
  const r = await rodarAlvo(`shell input keyevent ${key}`, 10000);
  return r.ok ? { ok: true, msg: `🔘 Apertei ${nome}.` } : { ok: false, msg: r.stderr };
}

async function toque(x, y) {
  const r = await rodarAlvo(`shell input tap ${parseInt(x)} ${parseInt(y)}`, 10000);
  return r.ok ? { ok: true, msg: `👆 Toquei em (${x}, ${y}).` } : { ok: false, msg: r.stderr };
}

async function deslizar(x1, y1, x2, y2, dur = 300) {
  const r = await rodarAlvo(`shell input swipe ${parseInt(x1)} ${parseInt(y1)} ${parseInt(x2)} ${parseInt(y2)} ${parseInt(dur)}`, 10000);
  return r.ok ? { ok: true, msg: "📲 Deslizei na tela." } : { ok: false, msg: r.stderr };
}

async function digitar(texto) {
  const limpo = String(texto || "").replace(/[ %&<>"\\']/g, " ").slice(0, 200);
  if (!limpo) return { ok: false, msg: "Nada pra digitar." };
  const r = await rodarAlvo(`shell input text "${limpo}"`, 10000);
  return r.ok ? { ok: true, msg: `⌨️ Digitei: ${limpo}` } : { ok: false, msg: r.stderr };
}

async function printTela() {
  const nome = `celular_${Date.now()}.png`;
  const caminho = path.join(__dirname, "..", "temp", nome);
  fs.mkdirSync(path.join(__dirname, "..", "temp"), { recursive: true });
  const r = await rodarAlvo(`exec-out screencap -p > "${caminho}"`, 20000);
  if (r.ok && fs.existsSync(caminho) && fs.statSync(caminho).size > 0) {
    return { ok: true, msg: `📸 Print do celular salvo.`, caminho };
  }
  return { ok: false, msg: `❌ Erro no print: ${r.stderr || "arquivo vazio"}` };
}

async function definirIp(ip, porta) {
  config.ip = String(ip || "").replace(/[^0-9.]/g, "");
  if (porta) config.porta = parseInt(porta, 10) || 5555;
  salvarConfig();
  log("INFO", "[CELULAR] IP configurado", { ip: config.ip, porta: config.porta });
  return `📱 IP do celular configurado: ${config.ip}:${config.porta}`;
}

const appsPacotes = {
  whatsapp: "com.whatsapp", zap: "com.whatsapp",
  instagram: "com.instagram.android", insta: "com.instagram.android",
  telegram: "org.telegram.messenger", tg: "org.telegram.messenger",
  youtube: "com.google.android.youtube", yt: "com.google.android.youtube",
  spotify: "com.spotify.music",
  twitter: "com.twitter.android", x: "com.twitter.android",
  chrome: "com.android.chrome", navegador: "com.android.chrome",
  camera: "com.google.android.GoogleCamera",
  configuracoes: "com.android.settings", config: "com.android.settings",
  "play store": "com.android.vending", play: "com.android.vending",
  netflix: "com.netflix.mediaclient",
  discord: "com.discord", dc: "com.discord",
  maps: "com.google.android.apps.maps", mapas: "com.google.android.apps.maps",
  fotos: "com.google.android.apps.photos", galeria: "com.google.android.apps.photos",
  gmail: "com.google.android.gm", email: "com.google.android.gm",
  twitch: "tv.twitch.android.app",
};

function acharPacote(nome) {
  const n = String(nome || "").toLowerCase().trim();
  if (appsPacotes[n]) return appsPacotes[n];
  for (const [k, v] of Object.entries(appsPacotes)) if (n.includes(k) || k.includes(n)) return v;
  return n.includes(".") ? n : null;
}

module.exports = { status, conectar, desconectar, espelhar, abrirApp, acharPacote, tecla, toque, deslizar, digitar, printTela, definirIp };
