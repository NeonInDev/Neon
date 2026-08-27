const { execSync } = require("child_process");
const { log } = require("../src/logger");
const fs = require("fs");
const path = require("path");

const TS_PATH = "C:\\Program Files\\Tailscale\\tailscale.exe";
const STATE_FILE = path.join(__dirname, "..", "logs", "tailscale_watch_state.json");

function tailscale(args) {
  try {
    return execSync(`"${TS_PATH}" ${args}`, { encoding: "utf-8", timeout: 15000, windowsHide: true }).trim();
  } catch (err) {
    return null;
  }
}

function tailscaleJSON(args) {
  const raw = tailscale(`${args} --json`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function carregarEstadoWatch() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
  } catch {}
  return null;
}

module.exports = {
  nome: "Tailscale",
  versao: "1.0",
  desc: "Gerenciamento da rede Tailscale — status, peers, IP, reconexão.",

  async iniciar() {
    log("INFO", "[TAILSCALE] Plugin Tailscale ativo");
  },

  async parar() {
    log("INFO", "[TAILSCALE] Plugin Tailscale parado");
  },

  ferramentas: [],

  acoes: [],

  // Funções expostas pro tools.js
  status() {
    const st = tailscaleJSON("status");
    if (!st) return { ok: false, erro: "Tailscale não respondeu." };
    return {
      ok: true,
      estado: st.BackendState || "Unknown",
      ip: st.Self?.TailscaleIPs?.[0] || st.Self?.IPs?.[0] || "?",
      hostname: st.Self?.HostName || st.Self?.DNSName || "?",
      healthy: st.Health?.length ? st.Health.join(", ") : null,
      online: st.Self?.Online ?? false,
    };
  },

  listarPeers() {
    const st = tailscaleJSON("status");
    if (!st) return { ok: false, erro: "Tailscale não respondeu." };
    const peers = [];
    if (st.Peer) {
      for (const [, p] of Object.entries(st.Peer)) {
        if (!p.InNetworkMap) continue;
        peers.push({
          nome: p.HostName || p.DNSName || "?",
          ip: p.TailscaleIPs?.[0] || p.IPs?.[0] || "?",
          online: p.Online ?? false,
          tipo: p.OS || "?",
        });
      }
    }
    return { ok: true, peers };
  },

  conectar() {
    const r = tailscale("up");
    return { ok: true, resultado: r || "tailscale up executado." };
  },

  desconectar() {
    const r = tailscale("down");
    return { ok: true, resultado: r || "tailscale down executado." };
  },

  ip() {
    const st = tailscaleJSON("status");
    if (!st) return { ok: false, erro: "Tailscale não respondeu." };
    const ips = st.Self?.TailscaleIPs || st.Self?.IPs || [];
    return { ok: true, ip: ips[0] || "?", todos: ips };
  },

  watch() {
    const estado = carregarEstadoWatch();
    if (!estado) return { ok: false, erro: "Arquivo de estado do watch não encontrado." };
    const peers = [];
    if (estado.peers) {
      for (const [id, p] of Object.entries(estado.peers)) {
        peers.push({ id, nome: p.n, online: p.on });
      }
    }
    return { ok: true, peers, ultimaVerificacao: estado.ch || "?" };
  },
};
