"use strict";

// MCP web: pesquisa e leitura de páginas (via cheerio/axios, sem abrir
// navegador). Ferramentas: web_pesquisar, web_youtube, web_ler_pagina.

const readline = require("readline");
const browser = require("./browser");

const FERRAMENTAS = [
  {
    name: "web_pesquisar",
    description: "Pesquisa na web (Brave/DDG copado) e retorna até 8 resultados com título e URL.",
    inputSchema: {
      type: "object",
      properties: { consulta: { type: "string", description: "O que procurar" } },
      required: ["consulta"],
    },
  },
  {
    name: "web_youtube",
    description: "Busca vídeos no YouTube e retorna os IDs/URLs encontrados.",
    inputSchema: {
      type: "object",
      properties: { termo: { type: "string", description: "O que buscar" } },
      required: ["termo"],
    },
  },
  {
    name: "web_ler_pagina",
    description: "Baixa uma página e retorna o texto do body e os links (sem abrir navegador).",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL completa (https://...)" },
        max_chars: { type: "number", description: "Limite de caracteres (padrão 5000)" },
      },
      required: ["url"],
    },
  },
];

function responder(id, resultado) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: resultado }) + "\n");
}

function erro(id, mensagem) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: mensagem } }) + "\n");
}

async function buscarComFallback(consulta) {
  try {
    // OPERA GX primeiro: navegador de verdade, evita os bloqueios do fetch puro
    return await browser.pesquisarOperaGX(consulta);
  } catch {}
  try {
    return await browser.pesquisarDuckDuckGo(consulta);
  } catch {}
  try {
    const cheerio = require("cheerio");
    const html = await browser.fetchPage(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(consulta)}`);
    const $ = cheerio.load(html);
    const resultados = [];
    $("a.result__a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const texto = $(el).text().trim();
      if (href) resultados.push({ titulo: texto.slice(0, 100), url: href });
    });
    if (resultados.length) return resultados.slice(0, 8);
  } catch {}
  try {
    // Instant Answer (JSON, não bloqueado): vira um único resultado resumido
    const { searchWeb } = require("./api");
    const r = await searchWeb(consulta);
    if (r) {
      return [{ titulo: r.titulo || consulta, url: r.url || "", resultado: String(r.resultado || "").slice(0, 800) }];
    }
  } catch {}
  throw new Error("não consegui pesquisar (busca bloqueada/limitada)");
}

async function chamarFerramenta(nome, args = {}) {
  if (nome === "web_pesquisar") {
    const r = await buscarComFallback(args.consulta);
    return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
  }
  if (nome === "web_youtube") {
    const r = await browser.buscarYouTube(args.termo);
    return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
  }
  if (nome === "web_ler_pagina") {
    const max = Number(args.max_chars) || 5000;
    const [texto, links] = await Promise.all([
      browser.scrapeTexto(args.url, "body"),
      browser.scrapeLinks(args.url, "a"),
    ]);
    return {
      content: [
        { type: "text", text: JSON.stringify({ texto: texto.slice(0, max), links: links.slice(0, 15) }, null, 2) },
      ],
    };
  }
  throw new Error("ferramenta desconhecida");
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (linha) => {
  let msg;
  try { msg = JSON.parse(linha); } catch { return; }
  if (msg.method === "initialize") {
    responder(msg.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "neon-web", version: "1.0.0" } });
  } else if (msg.method === "tools/list") {
    responder(msg.id, { tools: FERRAMENTAS });
  } else if (msg.method === "tools/call") {
    try { responder(msg.id, await chamarFerramenta(msg.params?.name, msg.params?.arguments)); }
    catch (err) { erro(msg.id, err.message); }
  }
});