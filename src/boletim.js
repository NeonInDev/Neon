const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

const BOLETIM_PATH = path.join(__dirname, "..", "boletim.json");
const META_PADRAO = 6;
const TOTAL_BIMESTRES = 4;

let dados = { meta: META_PADRAO, materias: {} };
try {
  if (fs.existsSync(BOLETIM_PATH)) {
    dados = JSON.parse(fs.readFileSync(BOLETIM_PATH, "utf8"));
    if (!dados.materias) dados.materias = {};
    if (!dados.meta) dados.meta = META_PADRAO;
  }
} catch (err) {
  log("WARN", "[BOLETIM] Falha ao ler boletim.json", { erro: err.message });
}

function salvar() {
  try {
    fs.writeFileSync(BOLETIM_PATH, JSON.stringify(dados, null, 2), "utf8");
  } catch (err) {
    log("ERROR", "[BOLETIM] Falha ao salvar", { erro: err.message });
  }
}

function slugMateria(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function materiaExibicao(key) {
  const m = dados.materias[key];
  return m && m.nome ? m.nome : key.charAt(0).toUpperCase() + key.slice(1);
}

function garantirMateria(nome) {
  const key = slugMateria(nome);
  if (!dados.materias[key]) dados.materias[key] = { nome: nome.trim(), notas: [] };
  else if (!dados.materias[key].nome) dados.materias[key].nome = nome.trim();
  return key;
}

function adicionarNota(nome, valor, bimestre, descricao) {
  const v = Number(String(valor).replace(",", "."));
  if (!isFinite(v) || v < 0 || v > 10) return { ok: false, erro: "Nota inválida — tem que ser entre 0 e 10." };
  let b = bimestre ? parseInt(bimestre, 10) : null;
  if (!isFinite(b)) b = null;
  if (b !== null && (b < 1 || b > TOTAL_BIMESTRES)) return { ok: false, erro: `Bimestre tem que ser 1 a ${TOTAL_BIMESTRES}.` };
  const key = garantirMateria(nome);
  if (b === null) {
    const usados = new Set(dados.materias[key].notas.map((n) => n.bimestre).filter(Boolean));
    for (let i = 1; i <= TOTAL_BIMESTRES; i++) {
      if (!usados.has(i)) { b = i; break; }
    }
    if (b === null) b = dados.materias[key].notas.length + 1;
  }
  const existente = dados.materias[key].notas.findIndex((n) => n.bimestre === b);
  const nota = { bimestre: b, valor: Math.round(v * 100) / 100, descricao: descricao || "" };
  let substituiu = false;
  if (existente >= 0) {
    dados.materias[key].notas[existente] = nota;
    substituiu = true;
  } else {
    dados.materias[key].notas.push(nota);
  }
  dados.materias[key].notas.sort((a, c) => a.bimestre - c.bimestre);
  salvar();
  log("INFO", "[BOLETIM] Nota registrada", { materia: key, bimestre: b, valor: v });
  return {
    ok: true,
    substituiu,
    mensagem: `${substituiu ? "Atualizei" : "Anotei"} a nota **${nota.valor}** de ${materiaExibicao(key)} no ${b}º bimestre.`,
  };
}

function removerUltimaNota(nome) {
  const key = slugMateria(nome);
  const m = dados.materias[key];
  if (!m || !m.notas.length) return { ok: false, erro: `Não tem nota nenhuma de ${nome} pra remover.` };
  const removida = m.notas.pop();
  salvar();
  return { ok: true, mensagem: `Removi a nota ${removida.valor} (${removida.bimestre}º bimestre) de ${materiaExibicao(key)}.` };
}

function mediaDe(key) {
  const m = dados.materias[key];
  if (!m || !m.notas.length) return null;
  const soma = m.notas.reduce((acc, n) => acc + n.valor, 0);
  return Math.round((soma / m.notas.length) * 100) / 100;
}

function quantoFalta(nome, metaExtra) {
  const key = slugMateria(nome);
  const m = dados.materias[key];
  if (!m || !m.notas.length) return { ok: false, erro: `Não tenho notas de ${nome} ainda. Manda tipo: anota nota de ${nome} 8` };
  const meta = metaExtra || dados.meta || META_PADRAO;
  const soma = m.notas.reduce((acc, n) => acc + n.valor, 0);
  const feitos = m.notas.length;
  const restantes = Math.max(TOTAL_BIMESTRES - feitos, 0);
  if (restantes === 0) {
    const mediaFinal = mediaDe(key);
    return {
      ok: true,
      fechado: true,
      mensagem: `📚 ${materiaExibicao(key)} fechou: média **${mediaFinal}** ${mediaFinal >= meta ? "✅ aprovado!" : "⚠️ abaixo da meta " + meta}`,
    };
  }
  const necessario = Math.max(0, (meta * TOTAL_BIMESTRES - soma) / restantes);
  const arredondado = Math.ceil(necessario * 10) / 10;
  let msg;
  if (arredondado > 10) {
    msg = `🚨 ${materiaExibicao(key)}: mesmo tirando 10 nos ${restantes} bimestre(s) que faltam não dá pra fechar com ${meta} (soma atual ${Math.round(soma * 10) / 10}).`;
  } else if (arredondado <= 0) {
    msg = `🎉 ${materiaExibicao(key)}: já tá garantido com média ${mediaDe(key)}! Pode tirar até 0 nos que faltam.`;
  } else {
    msg = `🎯 ${materiaExibicao(key)}: você precisa de **${arredondado}** em cada um dos ${restantes} bimestre(s) que faltam pra fechar com ${meta}. (atual: média ${mediaDe(key)})`;
  }
  return { ok: true, mensagem: msg, necessario: arredondado };
}

function boletimCompleto() {
  const keys = Object.keys(dados.materias);
  if (!keys.length) return { ok: true, mensagem: "📭 Boletim vazio! Me manda as notas tipo: `anota nota de matemática 8.5`" };
  const linhas = [];
  let somaMedias = 0;
  let cont = 0;
  for (const k of keys.sort()) {
    const m = dados.materias[k];
    if (!m.notas.length) continue;
    const notasTxt = m.notas.map((n) => `${n.bimestre}º:${n.valor}`).join(" · ");
    const media = mediaDe(k);
    const situacao = media >= (dados.meta || META_PADRAO) ? "✅" : "⚠️";
    linhas.push(`${situacao} **${materiaExibicao(k)}** — média ${media} (${notasTxt})`);
    somaMedias += media;
    cont++;
  }
  if (!cont) return { ok: true, mensagem: "📭 Cadastrou matérias mas sem notas ainda." };
  linhas.push(`\n📊 Média geral: **${Math.round((somaMedias / cont) * 100) / 100}** | Meta: ${(dados.meta || META_PADRAO)} | ${cont} matéria(s)`);
  return { ok: true, mensagem: "📒 **BOLETIM**\n" + linhas.join("\n") };
}

function definirMeta(valor) {
  const v = Number(String(valor).replace(",", "."));
  if (!isFinite(v) || v < 0 || v > 10) return { ok: false, erro: "Meta inválida." };
  dados.meta = v;
  salvar();
  return { ok: true, mensagem: `Meta definida: média **${v}** pra passar.` };
}

module.exports = {
  adicionarNota,
  removerUltimaNota,
  boletimCompleto,
  quantoFalta,
  definirMeta,
  mediaDe,
  slugMateria,
};
