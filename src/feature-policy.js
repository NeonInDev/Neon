"use strict";

const COMMANDS_ATIVOS = new Set([
  "neon",
  "saude",
  "spotify",
  "youtube",
  "letra",
  "ping",
  "sair",
  "moderacao",
]);

// Comandos publicados só como comando de servidor: aparecem na hora, sem
// esperar a propagação global do Discord. O deploy global ignora esses
// pra não criar o mesmo comando duas vezes.
const COMANDOS_SO_GUILD = new Set(["moderacao"]);

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

// comando que entra no deploy global (Routes.applicationCommands)
function comandoGlobal(nome) {
  return comandoAtivo(nome) && !COMANDOS_SO_GUILD.has(String(nome || "").toLowerCase());
}

function comandoSoGuild(nome) {
  return COMANDOS_SO_GUILD.has(String(nome || "").toLowerCase());
}

function categoriaAtiva(categoria) {
  return CATEGORIAS_ATIVAS.has(categoria);
}

function acaoAtiva(categoria, texto) {
  if (categoriaAtiva(categoria)) return true;
  return /^instala(?:r)?\s+.+?(?:\s+(?:na|pela|da)\s+steam)?$/i.test(String(texto || "").trim());
}

module.exports = { comandoAtivo, comandoGlobal, comandoSoGuild, categoriaAtiva, acaoAtiva };
