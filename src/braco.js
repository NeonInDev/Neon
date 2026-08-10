const { log } = require("../logger");

const URL_BASE = process.env.BRACO_URL || "http://localhost:8899";

const SERVOS = ["base", "ombro", "cotovelo", "punho", "garra"];

const POSICOES = {
  repouso: [90, 60, 90, 90, 100],
  origem: [90, 90, 90, 90, 90],
  saudar: [90, 110, 90, 90, 100],
  pegar: [90, 20, 45, 100, 100],
  soltar: [90, 20, 45, 100, 10],
};

async function enviar(caminho, corpo) {
  const r = await fetch(`${URL_BASE}${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo || {}),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`ESP32 respondeu HTTP ${r.status}`);
  return r.json();
}

async function status() {
  try {
    const r = await fetch(`${URL_BASE}/status`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { online: false };
    return { online: true, ...(await r.json()) };
  } catch {
    return { online: false };
  }
}

async function pose(nome) {
  const alvo = POSICOES[nome];
  if (!alvo) throw new Error(`pose desconhecida: ${nome}. Disponiveis: ${Object.keys(POSICOES).join(", ")}`);
  const r = await enviar("/pose", { servos: alvo });
  log("INFO", "[BRACO] Pose executada", { pose: nome, servos: alvo });
  return r;
}

async function servo(n, ang) {
  const r = await enviar("/servo", { n: Number(n), ang: Number(ang) });
  log("INFO", "[BRACO] Servo movido", { servo: n, ang });
  return r;
}

async function grip(aberto) {
  const r = await enviar("/grip", { aberto: !!aberto });
  log("INFO", "[BRACO] Garra", { aberto: !!aberto });
  return r;
}

module.exports = { SERVOS, POSICOES, URL_BASE, status, pose, servo, grip, enviar };
