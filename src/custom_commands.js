const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

const CUSTOM_FILE = path.join(__dirname, "..", "custom_commands.json");

let cache = null;

function carregar() {
  try {
    if (fs.existsSync(CUSTOM_FILE)) {
      const raw = fs.readFileSync(CUSTOM_FILE, "utf8");
      cache = JSON.parse(raw);
      return cache;
    }
  } catch (err) {
    log("WARN", "Erro ao carregar custom_commands.json", { erro: err.message });
  }
  cache = { comandos: [] };
  return cache;
}

function salvar() {
  try {
    fs.writeFileSync(CUSTOM_FILE, JSON.stringify(cache, null, 2), "utf8");
    return true;
  } catch (err) {
    log("ERROR", "Erro ao salvar custom_commands.json", { erro: err.message });
    return false;
  }
}

function detectar(texto) {
  if (!cache) carregar();
  const lower = texto.toLowerCase().trim();
  for (const cmd of cache.comandos) {
    for (const pat of cmd.patterns) {
      if (lower.includes(pat.toLowerCase())) return cmd;
    }
  }
  return null;
}

function adicionar(pattern, action, value, response) {
  if (!cache) carregar();
  cache.comandos.push({ patterns: [pattern], action, value, response });
  return salvar();
}

function remover(pattern) {
  if (!cache) carregar();
  const idx = cache.comandos.findIndex(c => c.patterns.some(p => p.toLowerCase() === pattern.toLowerCase()));
  if (idx === -1) return false;
  cache.comandos.splice(idx, 1);
  return salvar();
}

function listar() {
  if (!cache) carregar();
  return cache.comandos;
}

module.exports = { detectar, adicionar, remover, listar, carregar };
