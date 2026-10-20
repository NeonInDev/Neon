"use strict";

const COMMANDS_ATIVOS = new Set([
  "neon",
  "saude",
  "spotify",
  "youtube",
  "letra",
  "ping",
  "sair",
]);

const CATEGORIAS_ATIVAS = new Set([
  "voiceToggle",
  "jogo",
  "spotify_control",
  "youtube_control",
  "spotify",
  "youtube",
  "tts",
]);

function comandoAtivo(nome) {
  return COMMANDS_ATIVOS.has(String(nome || "").toLowerCase());
}

function categoriaAtiva(categoria) {
  return CATEGORIAS_ATIVAS.has(categoria);
}

function acaoAtiva(categoria, texto) {
  if (categoriaAtiva(categoria)) return true;
  return /^instala(?:r)?\s+.+?(?:\s+(?:na|pela|da)\s+steam)?$/i.test(String(texto || "").trim());
}

module.exports = { comandoAtivo, categoriaAtiva, acaoAtiva };
