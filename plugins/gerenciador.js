const fs = require("fs");
const path = require("path");
const { log } = require("../src/logger");

const IGNORAR = new Set(["gerenciador.js"]);

function carregarPlugins() {
  const pasta = __dirname;
  const arquivos = fs
    .readdirSync(pasta)
    .filter((f) => f.endsWith(".js") && !IGNORAR.has(f))
    .sort();

  const carregados = [];
  for (const arquivo of arquivos) {
    try {
      const mod = require(path.join(pasta, arquivo));
      if (mod && typeof mod === "object" && mod.nome) {
        carregados.push({
          arquivo,
          ...mod,
          ferramentas: Array.isArray(mod.ferramentas) ? mod.ferramentas : [],
          acoes: Array.isArray(mod.acoes) ? mod.acoes : [],
        });
        log("INFO", `[PLUGINS] Carregado: ${mod.nome} v${mod.versao || "?"} (${arquivo})`);
      }
    } catch (err) {
      log("ERROR", `[PLUGINS] Falha ao carregar ${arquivo}`, { erro: err.message });
    }
  }
  plugins = carregados;
  return plugins;
}

let plugins = [];

function todasFerramentas() {
  return plugins.flatMap((p) => p.ferramentas);
}

function todasAcoes() {
  return plugins.flatMap((p) => p.acoes);
}

async function iniciar(client) {
  plugins = carregarPlugins();
  for (const p of plugins) {
    if (p.nome === "WhatsApp") {
      log("INFO", "[WHATSAPP] Inicialização sob demanda; não abrirá no boot");
      continue;
    }
    try {
      if (typeof p.iniciar === "function") await p.iniciar(client);
    } catch (err) {
      log("ERROR", `[PLUGINS] iniciar falhou em ${p.nome}`, { erro: err.message });
    }
  }
  log("INFO", `[PLUGINS] ${plugins.length} plugin(s) ativo(s)`);
}

async function parar() {
  for (const p of plugins) {
    try {
      if (typeof p.parar === "function") await p.parar();
    } catch (err) {
      log("ERROR", `[PLUGINS] parar falhou em ${p.nome}`, { erro: err.message });
    }
  }
  plugins = [];
}

function listar() {
  return plugins;
}

module.exports = { iniciar, parar, carregarPlugins, todasFerramentas, todasAcoes, listar };