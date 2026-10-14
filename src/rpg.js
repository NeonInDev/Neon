// Modo RPG - Ordem Paranormal
// Le as fichas salvas em data/rpg_fichas.json e oferece consulta por
// funcao (utilidade/investigacao/combate/etc), elemento, itens, rolagens.
const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

const ARQUIVO = path.join(__dirname, "..", "data", "rpg_fichas.json");

const PADRAO = { ativa: null, fichas: {}, links: {} };

let cache = null;

function carregar() {
  if (cache) return cache;
  try {
    if (!fs.existsSync(ARQUIVO)) {
      cache = JSON.parse(JSON.stringify(PADRAO));
      return cache;
    }
    const lido = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
    cache = {
      ...JSON.parse(JSON.stringify(PADRAO)),
      ...lido,
      fichas: lido.fichas || {},
      links: lido.links || {},
    };
  } catch (err) {
    log("ERROR", "[RPG] Falha ao carregar fichas", { erro: err.message });
    cache = JSON.parse(JSON.stringify(PADRAO));
  }
  return cache;
}

function persistir() {
  if (!fs.existsSync(path.dirname(ARQUIVO))) fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
  fs.writeFileSync(ARQUIVO, JSON.stringify(cache, null, 2), "utf8");
}

function normalizar(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function slug(s) {
  return normalizar(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ------- consultas de ficha -------

function listarFichas() {
  return Object.entries(carregar().fichas).map(([id, f]) => ({ id, nome: f.nome }));
}

function getFicha(ref) {
  const d = carregar();
  if (!ref) {
    const ativa = d.ativa && d.fichas[d.ativa];
    if (ativa) return { id: d.ativa, ...ativa };
    const [id, f] = Object.entries(d.fichas)[0] || [];
    return f ? { id, ...f } : null;
  }
  if (d.fichas[ref]) return { id: ref, ...d.fichas[ref] };
  const alvo = slug(ref);
  const entradas = Object.entries(d.fichas);
  for (const [id, f] of entradas) {
    if (id === alvo || slug(f.nome) === alvo || normalizar(f.nome) === normalizar(ref)) return { id, ...f };
  }
  // casamento parcial (ex.: "wong" acha "wong-waywire")
  for (const [id, f] of entradas) {
    if (id.includes(alvo) || slug(f.nome).includes(alvo) || normalizar(f.nome).includes(normalizar(ref))) {
      return { id, ...f };
    }
  }
  return null;
}

function salvarFicha(id, ficha) {
  const d = carregar();
  if (!d.fichas[id]) d.fichas[id] = {};
  d.fichas[id] = { ...d.fichas[id], ...ficha, atualizadoEm: new Date().toISOString() };
  persistir();
  return d.fichas[id];
}

function definirAtiva(ref) {
  const f = getFicha(ref);
  if (!f) return null;
  carregar().ativa = f.id;
  persistir();
  return f;
}

// ajusta o bonus de uma pericia na ficha ativa (usado pelo skill modo_rpg)
function definirBonusPericia(nome, valor) {
  const f = getFicha(null);
  if (!f) return { ok: false, erro: "nenhuma ficha ativa" };
  const d = carregar();
  const alvo = d.fichas[f.id];
  if (!alvo) return { ok: false, erro: "ficha nao encontrada" };
  if (!alvo.pericias) alvo.pericias = { todos: {}, treinadas: [] };
  if (!alvo.pericias.todos) alvo.pericias.todos = {};
  const t = normalizar(nome);
  const todos = alvo.pericias.todos;
  const chave =
    Object.keys(todos).find((k) => normalizar(k) === t) ||
    Object.keys(todos).find((k) => normalizar(k).includes(t));
  if (!chave) return { ok: false, erro: `pericia "${nome}" nao encontrada` };
  todos[chave].bonus = valor;
  const tr = alvo.pericias.treinadas || [];
  const item = tr.find((p) => normalizar(p.nome) === normalizar(chave));
  if (item) item.bonus = valor;
  persistir();
  return { ok: true, nome: chave, ficha: f.nome };
}

// ------- rituais / habilidades / itens -------

function todasFuncoes(ficha) {
  const set = new Set();
  const grupos = [ficha.rituais, ficha.habilidades, ficha.itens];
  for (const g of grupos) for (const x of g || []) for (const fn of x.funcoes || []) set.add(fn);
  return Array.from(set).sort();
}

function filtrar(ficha, tipo, { funcao, elemento, busca } = {}) {
  const listaBase =
    tipo === "rituais" ? ficha.rituais : tipo === "habilidades" ? ficha.habilidades : ficha.itens;
  const termo = normalizar(busca);
  const fn = normalizar(funcao);
  const el = normalizar(elemento);
  return (listaBase || []).filter((x) => {
    if (fn && !(x.funcoes || []).map(normalizar).includes(fn)) return false;
    if (el && normalizar(x.elemento) !== el) return false;
    if (termo) {
      const alvo = normalizar([x.nome, x.resumo, x.descricao].filter(Boolean).join(" "));
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}

// filtra rituais + habilidades + itens de uma vez (por funcao/elemento/busca)
function filtrarTudo(ficha, filtros = {}) {
  return {
    rituais: filtrar(ficha, "rituais", filtros),
    habilidades: filtrar(ficha, "habilidades", filtros),
    itens: filtrar(ficha, "itens", filtros),
  };
}

function buscarRitual(ficha, termo) {
  const t = normalizar(termo);
  return (ficha.rituais || []).find((r) => normalizar(r.nome) === t) ||
    (ficha.rituais || []).find((r) => normalizar(r.nome).includes(t)) ||
    null;
}

function buscarHabilidade(ficha, termo) {
  const t = normalizar(termo);
  return (ficha.habilidades || []).find((h) => normalizar(h.nome).includes(t)) || null;
}

function buscarItem(ficha, termo) {
  const t = normalizar(termo);
  return (ficha.itens || []).find((i) => normalizar(i.nome).includes(t)) || null;
}

// ------- dados -------

// rola expressoes simples: "3d6", "1d20+5", "2d8+1d4-1"
function rolar(expressao, { vantagem = false, desvantagem = false } = {}) {
  const expr = String(expressao || "").toLowerCase().replace(/\s+/g, "");
  if (!/^[-+]?\d*d\d+([-+]\d+d?\d*)*$/.test(expr)) {
    return { ok: false, erro: `expressão inválida: "${expressao}"` };
  }
  const termos = expr.match(/[-+]?[^+-]+/g) || [];
  let total = 0;
  const detalhes = [];
  let d20 = null;
  for (const termo of termos) {
    const sinal = termo.startsWith("-") ? -1 : 1;
    const corpo = termo.replace(/^[-+]/, "");
    const m = corpo.match(/^(\d*)d(\d+)$/);
    if (m) {
      const qtd = m[1] ? parseInt(m[1], 10) : 1;
      const faces = parseInt(m[2], 10);
      const rolagens = [];
      for (let i = 0; i < qtd; i++) {
        let v = 1 + Math.floor(Math.random() * faces);
        if (faces === 20 && (vantagem || desvantagem)) {
          const v2 = 1 + Math.floor(Math.random() * faces);
          v = vantagem ? Math.max(v, v2) : Math.min(v, v2);
          rolagens.push(`${v}(${v}/${v2})`);
        } else {
          rolagens.push(v);
        }
        total += sinal * v;
        if (faces === 20) d20 = v;
      }
      detalhes.push(`${sinal < 0 ? "-" : ""}${qtd}d${faces}[${rolagens.join(", ")}]`);
    } else {
      const n = parseInt(corpo, 10);
      total += sinal * n;
      detalhes.push(`${sinal < 0 ? "-" : "+"}${n}`);
    }
  }
  const faces = parseInt((expr.match(/d(\d+)/) || [])[1] || "20", 10);
  return { ok: true, total, detalhes, d20, critico: d20 === 20, desastre: d20 === 1, faces };
}

// rola um teste de pericia: d20 + atributo + bonus
function rolarPericia(ficha, nome, { vantagem = false, desvantagem = false } = {}) {
  const t = normalizar(nome);
  const tabela = ficha.pericias?.todos || {};
  let chave = Object.keys(tabela).find((k) => normalizar(k) === t);
  if (!chave) chave = Object.keys(tabela).find((k) => normalizar(k).includes(t));
  if (!chave) {
    const treinadas = ficha.pericias?.treinadas || [];
    const achada = treinadas.find((p) => normalizar(p.nome).includes(t));
    if (!achada) return { ok: false, erro: `perícia "${nome}" não encontrada.` };
    return rolarTeste(ficha, achada.nome, achada.atributo, achada.bonus, { vantagem, desvantagem });
  }
  const info = tabela[chave];
  return rolarTeste(ficha, chave, info.atributo, info.bonus, { vantagem, desvantagem });
}

function rolarTeste(ficha, nome, atributo, bonus, { vantagem, desvantagem } = {}) {
  const valorAtrib = ficha.atributos?.[String(atributo).toUpperCase()] ?? 0;
  const roll = rolar("1d20", { vantagem, desvantagem });
  const total = roll.total + valorAtrib + (bonus || 0);
  return {
    ok: true,
    pericia: nome,
    atributo,
    dado: roll.d20,
    bonusAtributo: valorAtrib,
    bonusPericia: bonus || 0,
    total,
    critico: roll.d20 === 20,
    desastre: roll.d20 === 1,
    formula: `1d20(${roll.d20}) + ${atributo}(${valorAtrib}) + bônus(${bonus || 0})`,
  };
}

module.exports = {
  carregar,
  persistir,
  listarFichas,
  getFicha,
  salvarFicha,
  definirAtiva,
  definirBonusPericia,
  todasFuncoes,
  filtrar,
  filtrarTudo,
  buscarRitual,
  buscarHabilidade,
  buscarItem,
  rolar,
  rolarPericia,
  normalizar,
  slug,
};
