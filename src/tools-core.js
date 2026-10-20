"use strict";

const opencode = require("../plugins/opencode");

const FERRAMENTAS_ATIVAS = new Set(["codar"]);

function descricaoFerramentas() {
  return "- codar: Usa os MCPs ativos da Neon para web, arquivos do projeto, jogos Steam, Spotify e voz. Antes de qualquer ação com efeito externo, explique o que fará e peça confirmação explícita.";
}

function extrairFerramentas(texto) {
  const ferramentas = [];
  for (const linha of String(texto || "").split("\n")) {
    const m = linha.trim().match(/^[*_]{0,2}FERRAMENTA:[*_]{0,2}\s*(\w+)\s*(?:\|\s*(.*))?$/i);
    if (m) {
      ferramentas.push({ nome: m[1].toLowerCase(), args: (m[2] || "").trim() });
    }
  }
  return ferramentas;
}

async function executarFerramenta(ferramenta) {
  const nome = String(ferramenta?.nome || "").toLowerCase();
  if (!FERRAMENTAS_ATIVAS.has(nome)) {
    return `❌ Ferramenta desativada nesta versão da Neon: ${nome || "desconhecida"}.`;
  }
  const resultado = await opencode.executar(String(ferramenta.args || ""));
  return resultado || "❌ OpenCode não respondeu.";
}

module.exports = { descricaoFerramentas, extrairFerramentas, executarFerramenta };
