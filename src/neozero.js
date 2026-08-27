// Neo Zero Arquimedes — manopla de armadura com canhao de ar.
// Espelha o firmware firmware/neo_zero_arquimedes.ino (ESP32, :80).
// No PC, aponte NEOZERO_URL para a ponte (ex.: netsh portproxy 8898 -> ESP32:80).
const { log } = require("./logger");

const URL_BASE = process.env.NEOZERO_URL || "http://localhost:8898";

async function enviar(caminho, metodo = "POST", corpo) {
  const r = await fetch(`${URL_BASE}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) {
    let detalhe = `HTTP ${r.status}`;
    try { detalhe = (await r.json()).erro || detalhe; } catch {}
    throw new Error(detalhe);
  }
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

async function placas(aberto) {
  const r = await enviar(`/placas?aberto=${aberto ? "true" : "false"}`);
  log("INFO", "[NEOZERO] Placas", { aberto: !!aberto, ...r });
  return r;
}

async function disparar() {
  const r = await enviar("/disparo");
  log("INFO", "[NEOZERO] Disparo", r);
  return r;
}

module.exports = { URL_BASE, status, placas, disparar };
