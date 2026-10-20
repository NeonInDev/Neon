"use strict";

const ROTAS_ATIVAS = new Set([
  "GET /health",
  "GET /api/status",
  "GET /api/saude",
  "POST /api/chat",
  "POST /api/visao",
  "GET /api/modo",
  "POST /api/modo",
  "GET /api/pc",
  "POST /api/pc/volume",
  "POST /api/pc/screenshot",
  "POST /api/voz/falar",
  "POST /api/voz/audio",
  "POST /api/voz/stt",
  "GET /api/jogos/steam/buscar",
  "POST /api/jogos/steam/instalar",
  "POST /api/jogos/steam/desinstalar",
]);

function isRotaAtiva(method, url) {
  const pathname = new URL(url, "http://localhost").pathname;
  const rota = `${String(method || "").toUpperCase()} ${pathname}`;
  if (ROTAS_ATIVAS.has(rota)) return true;
  return rota.startsWith("POST /session/") && /^POST \/session\/[^/]+\/message$/.test(rota);
}

module.exports = { isRotaAtiva };
