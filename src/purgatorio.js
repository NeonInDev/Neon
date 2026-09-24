// Purgatório — rolagem de quirk (1dN) com pool ajustável.
// Só owner + usuário autorizado. Extras (adicionar/tirar quirk) persistem
// com motivo + requisitos obrigatórios (log auditável).
const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

const ARQ = path.join(__dirname, "..", "data", "purgatorio.json");
const PERMITIDOS = ["1442928336329379925", "1221320772224553071"];

function carregar() {
  try {
    const d = JSON.parse(fs.readFileSync(ARQ, "utf8"));
    if (!Array.isArray(d.quirks)) throw new Error("sem quirks");
    if (!Array.isArray(d.extras)) d.extras = [];
    return d;
  } catch {
    return { quirks: [], extras: [] };
  }
}

function salvar(d) {
  fs.writeFileSync(ARQ, JSON.stringify(d, null, 2), "utf8");
}

function normalizar(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// monta o pool do roll: cada entrada da lista = 1 posição; extras somam
// (adicionar) ou subtraem (tirar, remove 1 entrada existente) por nome
function montarPool(d) {
  const pool = [];
  for (const nome of d.quirks) pool.push(nome);
  const conta = new Map();
  for (const q of pool) conta.set(normalizar(q), (conta.get(normalizar(q)) || 0) + 1);
  for (const e of d.extras) {
    const k = normalizar(e.quirk);
    const tem = conta.get(k) || 0;
    if (e.acao === "adicionar") {
      pool.push(e.quirk);
      conta.set(k, tem + 1);
    } else if (tem > 0) {
      const idx = pool.findIndex((q) => normalizar(q) === k);
      if (idx >= 0) {
        pool.splice(idx, 1);
        conta.set(k, tem - 1);
      }
    }
  }
  return pool;
}

function linkDaQuirk(nome) {
  try {
    const { buscar, buscarFandom } = require("./quirks_envio");
    const q = buscar(nome);
    if (q && q.link) return q.link;
    const f = buscarFandom(nome);
    if (f && f.url) return f.url;
  } catch {}
  try {
    const sorteio = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "data", "quirks", "sorteio74.json"), "utf8")
    );
    const s = sorteio.find((x) => normalizar(x.titulo) === normalizar(nome));
    if (s && s.link) return s.link;
  } catch {}
  return null;
}

function permitido(userId) {
  return PERMITIDOS.includes(userId);
}

function resumoExtras(d) {
  if (!d.extras.length) return "Nenhum ajuste no pool.";
  const linhas = d.extras.map(
    (e) =>
      `• ${e.acao === "adicionar" ? "➕" : "➖"} **${e.quirk}** — <@${e.autor}> · ${e.data.split("T")[0]}\n  _Motivo:_ ${e.motivo}  _Req.:_ ${e.requisitos}`
  );
  return `**Ajustes do pool:**\n${linhas.join("\n")}`;
}

// separa "nome da quirk, motivo: X, requisitos: Y" em partes
// (aceita vírgula ou quebra de linha antes de "motivo"/"requisitos")
function separarCampos(alvo) {
  const t = String(alvo || "").trim().replace(/\s*\r?\n\s*/g, " ");
  let nome = t;
  let motivo = "";
  let requisitos = "";

  const mReq = t.match(/requisitos?\s*[:=]\s*([\s\S]+)$/i);
  if (mReq) {
    requisitos = mReq[1].trim();
    nome = t.slice(0, mReq.index);
  }

  const mMotivo = nome.match(/motivo\s*[:=]\s*([\s\S]+)$/i);
  if (mMotivo) {
    motivo = mMotivo[1].trim().replace(/[,\s]+$/g, "");
    nome = nome.slice(0, mMotivo.index);
  }

  nome = nome.replace(/[,\s]+$/g, "").trim();
  return { nome, motivo, requisitos };
}

async function interpretarPurgatorio(message) {
  const texto = (message.content || "").trim();
  const m = texto.match(
    /^\s*(?:neon|<@!?\d+>)[\s,!.\-:;]+(?:(?:rola|roll|role|rolando|girar)\s+)?purgat[oó]rio\b(.*)$/i
  );
  if (!m) {
    if (/purgat/i.test(texto)) {
      log("WARN", "[PURGATORIO] viu mas nao casou", { autor: message.author.id, texto: texto.slice(0, 120) });
    }
    return false;
  }
  const resto = (m[1] || "").trim();

  if (!permitido(message.author.id)) {
    await message.reply("🔒 Esse comando é exclusivo do chefe.").catch(() => {});
    return true;
  }

  const d = carregar();
  if (!d.quirks.length) {
    await message.reply("❌ Tabela do Purgatório vazia.").catch(() => {});
    return true;
  }

  const acaoMatch = resto.match(/^(adiciona|adicionar|add|tira|tirar|remove|remover|bota|coloca|abaixa|baixa)\s+(.+)$/i);
  if (acaoMatch) {
    const acao = /^(adiciona|adicionar|add|bota|coloca)/i.test(acaoMatch[1]) ? "adicionar" : "tirar";
    const { nome, motivo, requisitos } = separarCampos(acaoMatch[2].trim());
    if (!nome) {
      await message.reply("❌ Especifica a quirk. Formato: `neon, purgatorio adicionar <quirk>, motivo: X, requisitos: Y`").catch(() => {});
      return true;
    }
    if (!motivo || !requisitos) {
      await message
        .reply(
          "❌ Para ajustar o pool é **obrigatório** informar motivo e requisitos. Formato:\n`neon, purgatorio " +
            (acao === "adicionar" ? "adicionar Hellflames" : "tirar Hellflames") +
            ", motivo: <por quê>, requisitos: <requisitos>`"
        )
        .catch(() => {});
      return true;
    }
    const k = normalizar(nome);
    const achada = d.quirks.find((q) => normalizar(q) === k);
    if (!achada) {
      await message
        .reply(`❌ **"${nome}"** não está na tabela do Purgatório. Confere o nome e tenta de novo.`)
        .catch(() => {});
      return true;
    }
    const existeExtra = d.extras.find((e) => normalizar(e.quirk) === k);
    if (existeExtra && existeExtra.acao === acao) {
      await message
        .reply(`⚠️ **${achada}** já tem o ajuste "**${acao}**" no pool (${existeExtra.motivo}).`)
        .catch(() => {});
      return true;
    }
    d.extras.push({
      quirk: achada,
      acao,
      motivo,
      requisitos,
      autor: message.author.id,
      data: new Date().toISOString(),
    });
    salvar(d);
    log("INFO", "[PURGATORIO] ajuste de pool", { acao, quirk: achada, autor: message.author.id });
    await message
      .reply(
        `✅ Ajuste registrado: **${acao === "adicionar" ? "➕ adicionar" : "➖ tirar"}** **${achada}**.\n🎲 ` +
          `O pool agora tem ajuste ativo (motivo: ${motivo} | requisitos: ${requisitos}).`
      )
      .catch(() => {});
    return true;
  }

  if (/^(?:status|lista|listar|ver|mostrar|resumo|pool|consultar)$/i.test(resto)) {
    const pool = montarPool(d);
    await message
      .reply(`📊 **Pool do Purgatório:** ${pool.length} entradas (${d.quirks.length} quirks base).\n${resumoExtras(d)}`)
      .catch(() => {});
    return true;
  }

  // rolagem padrão
  const pool = montarPool(d);
  const numero = 1 + Math.floor(Math.random() * pool.length);
  const quirk = pool[numero - 1];
  const link = linkDaQuirk(quirk);
  const temAjuste = d.extras.some((e) => normalizar(e.quirk) === normalizar(quirk));
  log("INFO", "[PURGATORIO] rolagem", { numero, quirk, autor: message.author.id });
  await message
    .reply(
      `🎲 **PURGATÓRIO — rolagem**\n**Nº ${numero}/${pool.length}**\n🪄 **${quirk}**` +
        (temAjuste ? "\n⚡ _quirk com ajuste no pool_" : "") +
        (link ? `\n🔗 ${link}` : "")
    )
    .catch(() => {});
  return true;
}

module.exports = { interpretarPurgatorio, montarPool, separarCampos };