// =============================================================
// ESCADA DE PUNICAO DO DONO
// -------------------------------------------------------------
// Traduz o texto de punicoes do servidor em uma escada que o codigo
// consegue executar. Cada nivel faz:
//   - mute pelo tempo indicado
//   - perde X% de CONTROLE DA INDIVIDUALIDADE (vai no nick)
//   - remove N niveis do Arcane
//   - os ATRIBUTOS (cargos "Rank") retrocedem N ranques ou ficam
//     limitados a um ranque teto
//
// "controle" e um TETO, como o texto do dono diz ("nao conseguira
// ultrapassar 80%"): se a pessoa ja estava em 60%, continua em 60%.
// =============================================================
const ATRIBUTOS = require("./atributos.json");

// ordem da escada, do mais baixo pro mais alto
const ORDEM_RANK = ["F", "E", "D", "C", "B", "A", "S", "SS", "Z"];

const ESCALA_PUNICAO = [
  {
    warns: 1,
    controle: 100,
    texto: "1º aviso — sem mute, mas seu histórico fica sujo.",
  },
  {
    warns: 2,
    minutos: 120,
    controle: 100,
    arcane: 0,
    texto: "2º aviso — mute de 2 horas. Vale a pena pensar no comportamento.",
  },
  {
    warns: 3,
    minutos: 240,
    controle: 100,
    arcane: 2,
    texto: "3º aviso — mute de 4 horas e 2 níveis no Arcane.",
  },
  {
    warns: 4,
    minutos: 480,
    controle: 90,
    arcane: 4,
    texto: "4º aviso — 10% de controle, mute de 8 horas e 4 níveis no Arcane.",
  },
  {
    warns: 5,
    minutos: 720,
    controle: 80,
    arcane: 6,
    ranques: 1,
    texto: "5º aviso — 20% de controle, atributos -1 ranque, mute de 12h e 6 níveis no Arcane.",
  },
  {
    warns: 6,
    minutos: 1440,
    controle: 70,
    arcane: 8,
    ranques: 2,
    texto: "6º aviso — 30% de controle, atributos -2 ranques, mute de 24h e 8 níveis no Arcane.",
  },
  {
    warns: 7,
    minutos: 2880,
    controle: 60,
    arcane: "metade",
    ranques: 3,
    texto: "7º aviso — 40% de controle, atributos -3 ranques, mute de 2 dias e metade do Arcane.",
  },
  {
    warns: 8,
    minutos: 5760,
    controle: 80,
    arcane: "tudo",
    tetoRank: "B",
    texto: "8º aviso — teto de 80% de controle, atributos no máx. Rank B, mute de 4 dias e Arcane resetado.",
  },
  {
    warns: 9,
    minutos: 10080,
    controle: 60,
    arcane: "tudo",
    tetoRank: "C",
    perdePersonagem: true,
    apagaInventario: true,
    texto: "9º aviso — você perde o personagem: teto de 60% de controle, atributos no máx. Rank C, mute de 1 semana e inventário apagado.",
  },
  {
    warns: 10,
    acao: "ban",
    apagarDias: 7,
    controle: 0,
    // a API do Discord bane a CONTA, nao o IP. quem quiser derrubar os
    // alts precisa de um cargo de IP/anti-alt em outra ferramente.
    texto: "10º aviso — ban do servidor e 7 dias de mensagens apagadas (aguarda confirmação do Admin).",
    obs: "A API do Discord não faz ban por IP: isso derruba a conta, e os alts precisam de um sistema de IP separado.",
  },
];

function nivelPara(n) {
  let alvo = ESCALA_PUNICAO[0];
  for (const r of ESCALA_PUNICAO) if (n >= r.warns) alvo = r;
  return alvo;
}

// ---- leitura dos atributos atuais (vem dos cargos) ----
function lerAtributos(member) {
  const cargos = member?.roles?.cache;
  if (!cargos || typeof cargos.has !== "function") return {};
  const out = {};
  for (const [cat, dados] of Object.entries(ATRIBUTOS)) {
    for (const [rank, id] of Object.entries(dados.ranks)) {
      if (cargos.has?.(id)) {
        out[cat] = rank;
        break;
      }
    }
  }
  return out;
}

// "Força: S" -> o cargo "Força - Rank A" (um abaixo)
function cargoRankAbaixo(cat, rank) {
  const i = ORDEM_RANK.indexOf(rank);
  if (i < 0) return null;
  const alvo = ORDEM_RANK[i - 1];
  if (!alvo) return null; // ja esta no F, nao tem pra descer
  return ATRIBUTOS[cat]?.ranks?.[alvo] || null;
}

function indiceRank(rank) {
  return ORDEM_RANK.indexOf(rank);
}

function ehRankValido(r) {
  return ORDEM_RANK.includes(r);
}

// =============================================================
// APLICACAO NO SERVIDOR
// =============================================================
const { log } = require("./logger");

const RX_PCT_NO_NICK = /\s*[-–|]?\s*\d{1,3}%\s*$/;

function baseDoNick(member) {
  const n = member?.nickname || member?.user?.username || "";
  return String(n).replace(RX_PCT_NO_NICK, "").trim() || member?.user?.username || "user";
}

// a porcentagem de controle vive no nick
async function aplicarControleNoNick(member, controle) {
  try {
    const base = baseDoNick(member);
    const novo = `${base} ${controle}%`;
    if (novo.length > 32) return { ok: false, motivo: "nick passaria de 32 caracteres" };
    if (member.nickname !== novo) await member.setNickname(novo, "punição: controle da individualidade");
    return { ok: true, nick: novo };
  } catch (err) {
    return { ok: false, motivo: err.message };
  }
}

// le o % que ja esta no nick (0 = sem controle ainda, 100 = livre)
function lerControle(member) {
  const n = member?.nickname || "";
  const m = String(n).match(/(\d{1,3})\s*%\s*$/);
  if (!m) return 100;
  return Math.max(0, Math.min(100, parseInt(m[1], 10)));
}

// atributos: retroce N ranques, ou limita a um teto
async function aplicarAtributos(member, { ranques = 0, tetoRank = null }) {
  const atuais = lerAtributos(member);
  const remover = [];
  const adicionar = [];
  const resumo = [];

  for (const [cat, rank] of Object.entries(atuais)) {
    const teto = tetoRank ? indiceRank(tetoRank) : null;
    const i = indiceRank(rank);
    if (i < 0) continue;

    let novoRank = null;
    if (teto !== null && i > teto) {
      novoRank = tetoRank; // limita ao teto
    } else if (ranques > 0) {
      const alvo = ORDEM_RANK[i - ranques];
      if (alvo) novoRank = alvo;
    }
    if (!novoRank || novoRank === rank) continue;

    const dados = ATRIBUTOS[cat];
    const cargoAtual = dados?.ranks?.[rank];
    const cargoNovo = dados?.ranks?.[novoRank];
    if (!cargoAtual || !cargoNovo) continue;
    remover.push(cargoAtual);
    adicionar.push(cargoNovo);
    resumo.push(`${cat}: ${rank} → ${novoRank}`);
  }

  if (!remover.length) return { ok: true, resumo: [], motivo: "nenhum atributo para mudar" };
  const motivo = "punição: perde ranque nos atributos";
  try {
    // primeiro o novo ranque, depois tira o velho: se a pessoa ficar sem
    // cargo nenhum no meio do processo, nao perde o bonus antigo
    if (adicionar.length) await member.roles.add(adicionar, motivo);
    if (remover.length) await member.roles.remove(remover, motivo);
    return { ok: true, resumo };
  } catch (err) {
    return { ok: false, resumo, motivo: err.message };
  }
}

// Arcade/Arcane nao tem cargo por nivel no servidor, entao o nivel
// removido e controlado aqui e devolvido no log. O dono decide o que
// fazer com ele (ou liga num sistema externo).
function calcularArcane(atual, regra) {
  if (!regra) return { antes: atual, depois: atual, removidos: 0 };
  const base = typeof atual === "number" && atual >= 0 ? atual : 0;
  if (regra === "tudo") return { antes: base, depois: 0, removidos: base };
  if (regra === "metade") {
    const tira = Math.floor(base / 2);
    return { antes: base, depois: base - tira, removidos: tira };
  }
  const tira = Math.min(Number(regra) || 0, base);
  return { antes: base, depois: base - tira, removidos: tira };
}

// executa o nivel inteiro: mute + nick + atributos + arcane
async function aplicarNivel(guild, member, nivel, opts = {}) {
  const feito = [];
  const erros = [];
  const dobro = !!opts.dobro;

  // controle (teto, nunca sobe)
  const controleAtual = lerControle(member);
  const teto = nivel.controle ?? 100;
  const controle = Math.min(controleAtual, teto);
  if (controle !== controleAtual) {
    const r = await aplicarControleNoNick(member, controle);
    if (r.ok) feito.push(`controle ${controleAtual}% → ${controle}%`);
    else erros.push(`nick: ${r.motivo}`);
  } else {
    feito.push(`controle mantido em ${controle}% (teto do nível é ${teto}%)`);
  }

  // mute
  if (nivel.minutos) {
    const ms = Math.min(nivel.minutos, 40320) * 60000;
    try {
      await member.timeout(ms, `punição ${nivel.warns}º aviso`);
      feito.push(`mute de ${Math.round(nivel.minutos / 60)}h`);
    } catch (err) {
      erros.push(`mute: ${err.message}`);
    }
  }

  // atributos
  if (nivel.ranques || nivel.tetoRank) {
    const r = await aplicarAtributos(member, { ranques: nivel.ranques || 0, tetoRank: nivel.tetoRank || null });
    if (r.ok && r.resumo?.length) feito.push(`atributos: ${r.resumo.join(", ")}`);
    else if (!r.ok) erros.push(`atributos: ${r.motivo}`);
  }

  // arcanae
  let arcane = null;
  if (nivel.arcane !== undefined) {
    const reg = carregar().arcane?.[`${guild.id}:${member.id}`];
    const base = reg && typeof reg.niveis === "number" ? reg.niveis : reg;
    arcane = calcularArcane(typeof base === "number" ? base : 0, nivel.arcane);
    const d = carregar();
    if (!d.arcane) d.arcane = {};
    d.arcane[`${guild.id}:${member.id}`] = { niveis: arcane.depois, em: Date.now() };
    persistir();
    feito.push(`Arcane: ${arcane.antes} → ${arcane.depois} (${arcane.removidos} removidos)`);
  }

  // personagem / inventario: o bot nao controla a ficha, entao so avisa
  const avisos = [];
  if (nivel.perdePersonagem) avisos.push("👤 o personagem precisa ser removido pela ficha manualmente");
  if (nivel.apagaInventario) avisos.push("🎒 o inventário precisa ser limpo manualmente");

  log("INFO", "[PUNICÃO] nível aplicado", {
    guild: guild.name,
    usuario: member.id,
    nivel: nivel.warns,
    dobro,
    controle,
    feito: feito.length,
    erros: erros.length,
  });

  return { controle, feito, erros, avisos, arcane };
}

let _cache = null;
let _arq = null;
function arquivoArq() {
  if (!_arq) {
    _arq = require("path").join(__dirname, "..", "data", "arcane.json");
  }
  return _arq;
}
function carregar() {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(require("fs").readFileSync(arquivoArq(), "utf8"));
  } catch {
    _cache = {};
  }
  if (!Array.isArray(_cache)) _cache = {};
  return _cache;
}
function persistir() {
  try {
    require("fs").writeFileSync(arquivoArq(), JSON.stringify(_cache, null, 2));
  } catch (err) {
    log("ERROR", "[PUNICÃO] não salvou arcane", { erro: err.message });
  }
}

module.exports = {
  ESCALA_PUNICAO,
  ORDEM_RANK,
  ATRIBUTOS,
  nivelPara,
  lerAtributos,
  cargoRankAbaixo,
  indiceRank,
  ehRankValido,
  aplicarNivel,
  aplicarAtributos,
  lerControle,
  baseDoNick,
  calcularArcane,
};
