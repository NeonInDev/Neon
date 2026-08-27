// Integração com a API oficial do Notion.
// Usa axios (já existente no projeto) — sem dependência nova.
// Config no .env:
//   NOTION_API_KEY=<integration token> (criado em notion.so/my-integrations)
//   NOTION_DATABASE_ID=<id do banco de dados padrão>
const axios = require("axios");
const { NOTION_API_KEY, NOTION_DATABASE_ID, NOTION_AGENDA_ID } = require("../src/config");
const { log } = require("../src/logger");

const BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function client() {
  return axios.create({
    baseURL: BASE,
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    timeout: 30000,
  });
}

// Padroniza um erro da API Notion pra uma mensagem amigável.
function extrairErro(err) {
  const d = err?.response?.data;
  if (d?.message) return d.message;
  if (err?.code === "ECONNABORTED") return "timeout na API do Notion";
  return err?.message?.slice(0, 200) || "erro desconhecido";
}

function status() {
  return {
    configurado: Boolean(NOTION_API_KEY && NOTION_DATABASE_ID),
    temChave: Boolean(NOTION_API_KEY),
    temBanco: Boolean(NOTION_DATABASE_ID),
    temAgenda: Boolean(NOTION_AGENDA_ID),
    bancoId: NOTION_DATABASE_ID || null,
    agendaId: NOTION_AGENDA_ID || null,
  };
}

// Lista eventos da agenda (banco com coluna de data). Usado pelo Notion Calendar.
async function listarEventos(databaseId = NOTION_AGENDA_ID || NOTION_DATABASE_ID, limite = 30) {
  if (!NOTION_API_KEY) return { ok: false, erro: "NOTION_API_KEY não configurada" };
  if (!databaseId) return { ok: false, erro: "nenhum banco de agenda configurado" };
  try {
    const resp = await client().post(`/databases/${databaseId}/query`, {
      page_size: limite,
      sorts: [{ property: "Data", direction: "ascending" }],
    });
    const eventos = (resp.data.results || []).map((p) => {
      const props = {};
      for (const [nome, valor] of Object.entries(p.properties || {})) {
        props[nome] = resumirPropriedade(valor);
      }
      return { id: p.id, url: p.url, propriedades: props };
    });
    return { ok: true, eventos, total: eventos.length, banco: databaseId };
  } catch (err) {
    log("ERROR", "[NOTION] listarEventos falhou", { erro: extrairErro(err) });
    return { ok: false, erro: extrairErro(err) };
  }
}

// Cria um evento na agenda. Propriedades esperadas:
// { nome, data: "2026-08-25T14:00:00" ou "2026-08-25", descricao?, status? }
async function criarEvento({ nome, data, descricao, status: statusEvt }, databaseId = NOTION_AGENDA_ID || NOTION_DATABASE_ID) {
  if (!NOTION_API_KEY) return { ok: false, erro: "NOTION_API_KEY não configurada" };
  if (!databaseId) return { ok: false, erro: "nenhum banco de agenda configurado" };
  if (!nome || !data) return { ok: false, erro: "informe nome e data (ex.: nome=X, data=2026-08-25T14:00:00)" };
  try {
    const props = { nome };
    if (data) props.data = `date:${data}`;
    if (descricao) props.descricao = String(descricao);
    if (statusEvt) props.status = `select:${statusEvt}`;
    const resp = await client().post("/pages", {
      parent: { database_id: databaseId },
      properties: await montarPropriedades(props, databaseId),
    });
    return { ok: true, eventoId: resp.data.id, url: resp.data.url };
  } catch (err) {
    log("ERROR", "[NOTION] criarEvento falhou", { erro: extrairErro(err) });
    return { ok: false, erro: extrairErro(err) };
  }
}

// Busca as páginas de um banco de dados. Retorna resumo das propriedades.
async function listarBanco(databaseId = NOTION_DATABASE_ID, limite = 20) {
  if (!NOTION_API_KEY) return { ok: false, erro: "NOTION_API_KEY não configurada" };
  if (!databaseId) return { ok: false, erro: "NOTION_DATABASE_ID não configurado" };
  try {
    const resp = await client().post(`/databases/${databaseId}/query`, {
      page_size: limite,
    });
    const paginas = (resp.data.results || []).map((p) => {
      const props = {};
      for (const [nome, valor] of Object.entries(p.properties || {})) {
        props[nome] = resumirPropriedade(valor);
      }
      return { id: p.id, url: p.url, propriedades: props };
    });
    return { ok: true, paginas, total: paginas.length };
  } catch (err) {
    log("ERROR", "[NOTION] listarBanco falhou", { erro: extrairErro(err) });
    return { ok: false, erro: extrairErro(err) };
  }
}

// Converte um valor de propriedade do Notion em texto simples.
function resumirPropriedade(valor) {
  switch (valor.type) {
    case "title": {
      const t = (valor.title || []).map((x) => x.plain_text).join("");
      return t || "";
    }
    case "rich_text":
      return (valor.rich_text || []).map((x) => x.plain_text).join("");
    case "status":
      return valor.status?.name || "";
    case "select":
      return valor.select?.name || "";
    case "multi_select":
      return (valor.multi_select || []).map((x) => x.name).join(", ");
    case "checkbox":
      return valor.checkbox ? "✅" : "⬜";
    case "number":
      return valor.number != null ? String(valor.number) : "";
    case "date":
      return valor.date?.start || "";
    case "url":
      return valor.url || "";
    case "email":
      return valor.email || "";
    default:
      return "";
  }
}

// Cache do schema do banco (nome real das colunas e coluna de título), por databaseId.
const schemaCache = new Map();

// Busca o schema de um banco e retorna
// { mapa: chave-minúscula -> nome real, titulo: nome da coluna title, tipos: {nomeReal: tipo} }.
async function obterMapaColunas(databaseId = NOTION_DATABASE_ID) {
  if (!NOTION_API_KEY || !databaseId) return { mapa: {}, titulo: null, tipos: {} };
  if (schemaCache.has(databaseId)) return schemaCache.get(databaseId);
  const info = { mapa: {}, titulo: null, tipos: {} };
  try {
    const resp = await client().get(`/databases/${databaseId}`);
    for (const [nome, meta] of Object.entries(resp.data.properties || {})) {
      info.mapa[nome.toLowerCase()] = nome;
      info.tipos[nome] = meta.type;
      if (meta.type === "title") info.titulo = nome;
    }
    schemaCache.set(databaseId, info);
    return info;
  } catch {
    return info;
  }
}

// Monta as propriedades a partir de um objeto simples {nome: valor}.
// A chave que corresponde à coluna 'title' do banco vira o título (caso não
// exista coluna title no schema, a PRIMEIRA chave assume esse papel).
// Tipos: checkbox, número, multi_select, select (prefixo "select:"), status
// (prefixo "status:" ou coluna "Status"), data (prefixo "date:"), url (prefixo
// "url:"), resto é rich_text. As chaves são normalizadas (case-insensitive).
async function montarPropriedades(obj, databaseId = NOTION_DATABASE_ID) {
  const { mapa, titulo, tipos } = await obterMapaColunas(databaseId);
  const entradas = Object.entries(obj || {});
  const props = {};
  for (let i = 0; i < entradas.length; i++) {
    const [nome, valor] = entradas[i];
    if (valor === undefined || valor === null) continue;
    const nomeReal = mapa[nome.toLowerCase()] || nome;
    const ehTitulo = (titulo && nomeReal.toLowerCase() === titulo.toLowerCase()) || (!titulo && i === 0);
    const tipoReal = tipos[nomeReal] || "";
    const chave = nomeReal.toLowerCase();
    if (ehTitulo) {
      props[nomeReal] = { title: [{ text: { content: String(valor).slice(0, 2000) } }] };
    } else if (tipoReal === "status" || (chave === "status" && tipoReal !== "select")) {
      const v = String(valor);
      props[nomeReal] = { status: { name: v } };
    } else if (tipoReal === "select" || (typeof valor === "string" && valor.startsWith("select:"))) {
      const v = typeof valor === "string" && valor.startsWith("select:") ? valor.slice(7) : String(valor);
      props[nomeReal] = { select: { name: v } };
    } else if (tipoReal === "date" || (typeof valor === "string" && valor.startsWith("date:"))) {
      const v = typeof valor === "string" && valor.startsWith("date:") ? valor.slice(5) : String(valor);
      props[nomeReal] = { date: { start: v } };
    } else if (typeof valor === "boolean") {
      props[nomeReal] = { checkbox: valor };
    } else if (typeof valor === "number") {
      props[nomeReal] = { number: valor };
    } else if (Array.isArray(valor)) {
      props[nomeReal] = { multi_select: valor.map((v) => ({ name: String(v) })) };
    } else if (typeof valor === "string" && valor.startsWith("url:")) {
      props[nomeReal] = { url: valor.slice(4) };
    } else {
      props[nomeReal] = { rich_text: [{ text: { content: String(valor).slice(0, 2000) } }] };
    }
  }
  return props;
}

// Cria uma página nova dentro do banco de dados.
async function criarPagina(propriedades, databaseId = NOTION_DATABASE_ID) {
  if (!NOTION_API_KEY) return { ok: false, erro: "NOTION_API_KEY não configurada" };
  if (!databaseId) return { ok: false, erro: "NOTION_DATABASE_ID não configurado" };
  try {
    const resp = await client().post("/pages", {
      parent: { database_id: databaseId },
      properties: await montarPropriedades(propriedades, databaseId),
    });
    return { ok: true, paginaId: resp.data.id, url: resp.data.url };
  } catch (err) {
    log("ERROR", "[NOTION] criarPagina falhou", { erro: extrairErro(err) });
    return { ok: false, erro: extrairErro(err) };
  }
}

// Cria uma página avulsa (sem banco) com conteúdo em blocos.
async function criarPaginaSolta(titulo, conteudo = []) {
  if (!NOTION_API_KEY) return { ok: false, erro: "NOTION_API_KEY não configurada" };
  try {
    const children = [];
    for (const linha of conteudo) {
      if (linha.startsWith("# ")) {
        children.push({
          object: "block",
          type: "heading_2",
          heading_2: { rich_text: [{ text: { content: linha.slice(2) } }] },
        });
      } else if (linha.startsWith("- ")) {
        children.push({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: { rich_text: [{ text: { content: linha.slice(2) } }] },
        });
      } else {
        children.push({
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ text: { content: linha } }] },
        });
      }
    }
    const resp = await client().post("/pages", {
      parent: { database_id: NOTION_DATABASE_ID },
      properties: { title: [{ text: { content: String(titulo).slice(0, 200) } }] },
      children,
    });
    return { ok: true, paginaId: resp.data.id, url: resp.data.url };
  } catch (err) {
    log("ERROR", "[NOTION] criarPaginaSolta falhou", { erro: extrairErro(err) });
    return { ok: false, erro: extrairErro(err) };
  }
}

// Atualiza propriedades de uma página existente.
async function atualizarPagina(paginaId, propriedades) {
  if (!NOTION_API_KEY) return { ok: false, erro: "NOTION_API_KEY não configurada" };
  if (!paginaId) return { ok: false, erro: "paginaId não informado" };
  try {
    const resp = await client().patch(`/pages/${paginaId}`, {
      properties: await montarPropriedades(propriedades),
    });
    return { ok: true, paginaId: resp.data.id, url: resp.data.url };
  } catch (err) {
    log("ERROR", "[NOTION] atualizarPagina falhou", { erro: extrairErro(err) });
    return { ok: false, erro: extrairErro(err) };
  }
}

// Retorna a descrição das capacidades pro prompt da IA.
function descricaoFerramentas() {
  if (!NOTION_API_KEY) return "";
  const agenda = NOTION_AGENDA_ID ? " (agenda: calendar)" : "";
  return `NOTION (${NOTION_DATABASE_ID ? "banco configurado" : "sem banco padrão"}${agenda}):
- "FERRAMENTA: notion_listar" — lista as páginas/itens do banco do Notion
- "FERRAMENTA: notion_criar | nome=X, materia=select:Matematica, status=Em andamento, tipo=select:Prova, data=date:2026-08-25" — cria um item novo no banco
- "FERRAMENTA: notion_atualizar | id=<pageId>, status=Feito" — atualiza um item (ex.: marca como Feito)
- "FERRAMENTA: notion_status" — mostra se a integração está configurada
- "FERRAMENTA: agenda_listar" — lista os eventos da agenda (aparecem no Notion Calendar)
- "FERRAMENTA: agenda_criar | nome=X, data=2026-08-25T14:00:00, descricao=Y, status=Planejado" — cria um evento na agenda`;
}

module.exports = {
  status,
  listarBanco,
  criarPagina,
  criarPaginaSolta,
  atualizarPagina,
  listarEventos,
  criarEvento,
  descricaoFerramentas,
};