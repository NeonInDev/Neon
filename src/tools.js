const { log } = require("./logger");
const opencode = require("../plugins/opencode");
const notion = require("../plugins/notion");

function descricaoFerramentas() {
  const base = `- codar: Delega QUALQUER tarefa ao opencode. Usa navegador, PC, codigo, pesquisa, arquivo, TUDO. Uso: codar | [descricao detalhada do que fazer]`;
  const not = notion.descricaoFerramentas();
  return not ? `${base}\n${not}` : base;
}

function extrairFerramentas(texto) {
  const linhas = texto.split("\n");
  const ferramentas = [];
  for (const linha of linhas) {
    const m = linha.trim().match(/^[*_]{0,2}FERRAMENTA:[*_]{0,2}\s*(\w+)\s*(?:\|\s*(.*))?$/i);
    if (m) ferramentas.push({ nome: m[1].toLowerCase(), args: (m[2] || "").trim() });
  }
  return ferramentas;
}

async function executarFerramenta(ferramenta, userId = null) {
  const { nome, args } = ferramenta;

  // Ferramentas nativas do Notion (API oficial, sem opencode)
  if (nome.startsWith("notion_")) {
    return executarNotion(nome, args);
  }

  log("INFO", "[TOOLS] Delegando pro opencode", { nome, args: args?.slice(0, 100) });

  const resultado = await opencode.executar(args);
  return resultado || "❌ OpenCode não respondeu.";
}

async function executarNotion(nome, args) {
  log("INFO", "[TOOLS][NOTION]", { nome, args: args?.slice(0, 100) });
  const pares = {};
  for (const parte of (args || "").split(",")) {
    const eq = parte.indexOf("=");
    if (eq > 0) {
      const chave = parte.slice(0, eq).trim().toLowerCase();
      const valor = parte.slice(eq + 1).trim();
      pares[chave] = valor;
    }
  }

  try {
    switch (nome) {
      case "notion_status": {
        const s = await notion.status();
        if (!s.configurado) return "❌ Notion não configurado. Falta NOTION_API_KEY e/ou NOTION_DATABASE_ID no .env.";
        return `✅ Notion configurado. Banco: ${s.bancoId}`;
      }
      case "notion_listar": {
        const limite = parseInt(pares["limite"], 10) || 20;
        const r = await notion.listarBanco(pares["banco"] || undefined, limite);
        if (!r.ok) return `❌ ${r.erro}`;
        if (!r.paginas.length) return "Banco vazio.";
        const linhas = r.paginas.map((p) => {
          const resumo = Object.entries(p.propriedades)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" | ");
          return `• ${resumo} (id: ${p.id})`;
        });
        return `📋 ${r.total} item(ns):\n${linhas.join("\n")}`;
      }
      case "notion_criar": {
        if (!pares["nome"]) return "❌ Uso: notion_criar | nome=X, materia=select:Matematica, status=Em andamento";
        const props = { nome: pares["nome"] };
        for (const [k, v] of Object.entries(pares)) {
          if (k !== "nome") props[k] = v;
        }
        const r = await notion.criarPagina(props, pares["banco"] || undefined);
        if (!r.ok) return `❌ ${r.erro}`;
        return `✅ Item criado: ${r.url}`;
      }
      case "notion_atualizar": {
        if (!pares["id"]) return "❌ Uso: notion_atualizar | id=<pageId>, status=select:Feito";
        const props = {};
        for (const [k, v] of Object.entries(pares)) {
          if (k !== "id") props[k] = v;
        }
        const r = await notion.atualizarPagina(pares["id"], props);
        if (!r.ok) return `❌ ${r.erro}`;
        return `✅ Item atualizado: ${r.url}`;
      }
      case "agenda_listar": {
        const limite = parseInt(pares["limite"], 10) || 30;
        const r = await notion.listarEventos(pares["banco"] || undefined, limite);
        if (!r.ok) return `❌ ${r.erro}`;
        if (!r.eventos.length) return "Agenda vazia.";
        const linhas = r.eventos.map((p) => {
          const resumo = Object.entries(p.propriedades)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" | ");
          return `• ${resumo} (id: ${p.id})`;
        });
        return `📅 ${r.total} evento(s):\n${linhas.join("\n")}`;
      }
      case "agenda_criar": {
        if (!pares["nome"] || !pares["data"]) return "❌ Uso: agenda_criar | nome=X, data=2026-08-25T14:00:00, descricao=Y, status=Planejado";
        const r = await notion.criarEvento({
          nome: pares["nome"],
          data: pares["data"],
          descricao: pares["descricao"],
          status: pares["status"],
        }, pares["banco"] || undefined);
        if (!r.ok) return `❌ ${r.erro}`;
        return `✅ Evento criado: ${r.url}`;
      }
      default:
        return `❌ Ferramenta Notion desconhecida: ${nome}`;
    }
  } catch (err) {
    log("ERROR", "[TOOLS][NOTION] erro", { erro: err.message?.slice(0, 150) });
    return `❌ Erro na ferramenta Notion: ${err.message?.slice(0, 150)}`;
  }
}

async function processarResposta(texto, userId = null) {
  const ferramentas = extrairFerramentas(texto);
  if (!ferramentas.length) return { texto, acoes: [] };
  const resultados = [];
  for (const f of ferramentas) {
    const res = await executarFerramenta(f, userId);
    resultados.push({ ferramenta: f, resultado: res });
  }
  return { texto, acoes: resultados };
}

function iniciar() {
  log("INFO", "[TOOLS] Tudo delegado ao opencode serve");
  opencode.iniciarServer().catch(() => {});
}

module.exports = { iniciar, executarFerramenta, processarResposta, descricaoFerramentas, extrairFerramentas };
