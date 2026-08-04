const { log } = require("./logger");
const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const execAsync = promisify(execCb);

const CONFIG_PATH = path.join(__dirname, "..", "termux_config.json");
let config = {
  ip: "",
  porta: 8022,
  usuario: "",
  chave: "",
};

function carregarConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
  } catch {}
}
carregarConfig();

function salvarConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function alvo() {
  if (!config.ip) return null;
  const porta = config.porta ? `-p ${config.porta}` : "";
  const identidade = config.chave ? `-i "${config.chave}"` : "";
  const usuario = config.usuario ? `${config.usuario}@` : "";
  return { porta, identidade, usuario };
}

async function rodarComando(cmd) {
  const t = alvo();
  if (!t) return { ok: false, msg: "Termux não configurado. Use: Neon, configura termux ip 192.168.x.x porta 8022 usuario u0_a100" };
  const comando = String(cmd || "").replace(/"/g, '\\"').replace(/\\/g, "\\\\");
  const ssh = `ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=8 ${t.porta} ${t.identidade} ${t.usuario}${config.ip} "${comando}"`;
  try {
    const { stdout, stderr } = await execAsync(ssh, { timeout: 30000, windowsHide: true });
    return { ok: true, msg: (stdout || "").trim() || "(sem saída)", stderr: (stderr || "").trim() };
  } catch (err) {
    return { ok: false, msg: (err.stdout || "").trim() || (err.stderr || "").trim() || err.message };
  }
}

async function status() {
  if (!config.ip) return { ok: false, msg: "Termux não configurado. Use: Neon, configura termux ip 192.168.x.x" };
  const r = await rodarComando("echo ok && whoami");
  return {
    ok: r.ok,
    ip: config.ip,
    porta: config.porta,
    usuario: config.usuario || "(auto)",
    conectado: r.ok,
    msg: r.ok ? `✅ Termux conectado (${config.ip}:${config.porta}).` : `❌ Sem conexão com o Termux: ${r.msg}`,
  };
}

async function definirConfig(ip, porta, usuario, chave) {
  config.ip = String(ip || "").replace(/[^0-9.]/g, "");
  if (porta) config.porta = parseInt(porta, 10) || 8022;
  if (usuario) config.usuario = String(usuario);
  if (chave) config.chave = String(chave);
  salvarConfig();
  log("INFO", "[TERMUX] Configurado", { ip: config.ip, porta: config.porta, usuario: config.usuario });
  return `🖥️ Termux configurado: ${config.ip}:${config.porta}${config.usuario ? ` (${config.usuario})` : ""}`;
}

module.exports = { rodarComando, status, definirConfig };
