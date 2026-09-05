// Skill "modo_rpg" - assistente de RPG de mesa do dono (Ordem Paranormal).
// Interação por TEXTO; a Neon não entra na call.
//
// LINKS RÁPIDOS (abre a ABA do site sem duplicar, e foca nela):
//   skill_modo_rpg | zacarias     → página do personagem
//   skill_modo_rpg | campanha     → página da campanha
//   skill_modo_rpg | escudo       → escudo do mestre
//   skill_modo_rpg | mapa         → abre o mapa (link mais recente enviado)
//   skill_modo_rpg | mapa <url>   → salva o novo mapa e já abre
//   skill_modo_rpg | links        → mostra os links salvos
//
// ROLLS (ajuda na mesa):
//   skill_modo_rpg | rola 2d6
//   skill_modo_rpg | 1d20+3
//   skill_modo_rpg | d20 vantagem / d20 desvantagem
//
// SITES/RECURSOS:
//   skill_modo_rpg | abre <site>  (dnd5e, ordem, tormenta, roll20, etc.)

const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const pc = require("../src/pc.js");

const DEBUG_PORT = 9222;

const DATA_DIR = path.join(__dirname, "..", "data");
const ARQUIVO_LINKS = path.join(DATA_DIR, "rpg_links.json");

const LINKS_PADRAO = {
  zacarias:
    "https://crisordemparanormal.com/agente/iS2IPlVIxHgNrL8QgiuY",
  campanha:
    "https://crisordemparanormal.com/campanha/xb06EJqPpAE4AJM4sQQN",
  escudo:
    "https://crisordemparanormal.com/escudo-do-mestre/xb06EJqPpAE4AJM4sQQN",
  mapa: null,
};

function carregarLinks() {
  try {
    if (!fs.existsSync(ARQUIVO_LINKS)) return { ...LINKS_PADRAO };
    const lidos = JSON.parse(fs.readFileSync(ARQUIVO_LINKS, "utf8"));
    return { ...LINKS_PADRAO, ...lidos };
  } catch {
    return { ...LINKS_PADRAO };
  }
}

function salvarLinks(links) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ARQUIVO_LINKS, JSON.stringify(links, null, 2), "utf8");
}

const TITULOS = { zacarias: "Zacarias (personagem)", campanha: "Campanha", escudo: "Escudo do Mestre", mapa: "Mapa" };

async function conectarOpera() {
  const puppeteer = require("puppeteer");
  const b = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
    defaultViewport: null,
  });
  return b;
}

function abrirUrlTimeouter(url) {
  return new Promise((resolve) => {
    const child = exec(
      `powershell -NoProfile -NonInteractive -Command "Start-Process -FilePath '${url.replace(/'/g, "''")}'"`,
      { windowsHide: true },
      (err, stdout, stderr) => resolve({ ok: !err, erro: stderr || (err && err.message) })
    );
    child.on("error", () => resolve({ ok: false, erro: "falha ao abrir" }));
    setTimeout(() => { try { child.kill(); } catch {} resolve({ ok: true, timeout: true }); }, 8000);
  });
}

async function focarNaAba(url) {
  const alvo = String(url || "");
  let b = null;
  try {
    b = await conectarOpera();
    const pages = await b.pages();
    for (const page of pages) {
      let atual = "";
      try { atual = await page.url(); } catch {}
      const normalizada = (u) => (u || "").replace(/\/+$/, "");
      if (atual && normalizada(atual) === normalizada(alvo)) {
        try { await page.bringToFront(); } catch {}
        try { b.disconnect(); } catch {}
        return { ok: true, focada: true, url: atual };
      }
    }
    try { b.disconnect(); } catch {}
  } catch (err) {
    console.error("[MODO_RPG] falha ao conectar no Opera", err.message);
    if (b) { try { b.disconnect(); } catch {} }
  }

  const r = await abrirUrlTimeouter(alvo);
  if (r.ok) return { ok: true, focada: false, url: alvo };
  return { ok: false, erro: r.erro || "Falha ao abrir." };
}

async function abrirLink(nome) {
  const links = carregarLinks();
  const url = links[nome];
  if (!url) return `❌ Ainda não tenho o link do **${TITULOS[nome]}**. Manda: \`mapa <link>\`.`;
  const r = await focarNaAba(url);
  return r.ok
    ? (r.focada ? `✅ Já estava aberta, te levei pra aba do **${TITULOS[nome]}** (sem duplicar).` : `🔗 Abri **${TITULOS[nome]}** no navegador.`)
    : `❌ ${r.erro || "Não consegui abrir."}`;
}

async function salvarNovoMapa(args) {
  const url = String(args || "").trim();
  if (!/^https?:\/\/\S+$/i.test(url)) {
    return "❌ Esse link de mapa não é válido. Clica com o botão direito e copia o endereço.";
  }
  const links = carregarLinks();
  links.mapa = url;
  salvarLinks(links);
  const r = await focarNaAba(url);
  return r.ok
    ? `🗺️ **Mapa atualizado!** Salvo e abri na aba. (se a aba antiga estiver aberta, ela fica; a nova tá na frente)`
    : `🗺️ Mapa salvo: ${url}`;
}

function formatarLinks() {
  const links = carregarLinks();
  return [
    "🎲 **Links do RPG salvos:**",
    "",
    `• **Zacarias** → ${links.zacarias}`,
    `• **Campanha** → ${links.campanha}`,
    `• **Escudo** → ${links.escudo}`,
    `• **Mapa** → ${links.mapa || "não definido (manda: mapa <link>)"}`,
  ].join("\n");
}

const SITES = [
  { alias: ["dnd5e", "dnd 5e", "d&d 5e", "5e", "rpg", "d20"], url: "https://5e.wikidot.com", nome: "5e Wikidot" },
  { alias: ["dndbeyond", "beyond"], url: "https://www.dndbeyond.com", nome: "D&D Beyond" },
  { alias: ["ordem", "ordem paranormal", "cellbit"], url: "https://ordemparanormal.fandom.com", nome: "Ordem Paranormal Wiki" },
  { alias: ["tormenta", "tormenta20", "t20"], url: "https://tormenta20.fandom.com", nome: "Tormenta20 Wiki" },
  { alias: ["roll20", "rolagem"], url: "https://roll20.net", nome: "Roll20" },
  { alias: ["ficha", "dicecloud"], url: "https://dicecloud.com", nome: "DiceCloud" },
  { alias: ["rolador", "rolar", "dados"], url: "https://www.rolladie.net", nome: "Rolador de dados online" },
];

function interpretaRoll(texto) {
  const t = String(texto || "")
    .toLowerCase()
    .replace(/\brola\w*\s*/i, "")
    .replace(/^\s*[veça:\-!/\s]+/i, "")
    .trim();

  const vantagem = /\b(vantagem|vant|com vantagem)\b/i.test(t);
  const desvantagem = /\b(desvantagem|desvant|disadvantage)\b/i.test(t);

  const m = t.match(/(?:(\d+)\s*)?d(\d{1,3})(?:\s*([+\-])\s*(\d+))?/);
  if (!m) return null;

  const qtd = m[1] ? parseInt(m[1], 10) : 1;
  const lados = parseInt(m[2], 10);
  const mod = m[3] ? (m[3] === "-" ? -parseInt(m[4], 10) : parseInt(m[4], 10)) : 0;

  if (qtd < 1 || qtd > 100) return null;
  if (![2, 4, 6, 8, 10, 12, 20, 100].includes(lados)) return { invalido: `d${lados} não suportado (use d4, d6, d8, d10, d12, d20, d100).` };
  if ((vantagem || desvantagem) && qtd !== 1) return { invalido: "Vantagem/desvantagem só funciona com 1 dado." };

  return { qtd, lados, mod, vantagem, desvantagem };
}

function rolar(lados, vezes) {
  const out = [];
  for (let i = 0; i < vezes; i++) out.push(1 + Math.floor(Math.random() * lados));
  return out;
}

function executarRoll(info) {
  const fmt = (m) => (m > 0 ? `+${m}` : m < 0 ? `${m}` : "");

  let texto;
  if (info.vantagem || info.desvantagem) {
    const [a, b] = [rolar(info.lados, 1)[0], rolar(info.lados, 1)[0]];
    const escolhido = info.vantagem ? Math.max(a, b) : Math.min(a, b);
    const total = escolhido + info.mod;
    const banner = info.vantagem ? "VANTAGEM" : "DESVANTAGEM";
    const criticos = info.lados === 20 && escolhido === 20 ? "\n🎉 CRÍTICO!" : info.lados === 20 && escolhido === 1 ? "\n💀 FALHA CRÍTICA!" : "";
    texto = `🎲 \`[${banner}]\` d${info.lados}${fmt(info.mod)}: rolou **${a}** e **${b}** → pegou **${escolhido}** = **${total}**${criticos}`;
  } else {
    const resultados = rolar(info.lados, info.qtd);
    const total = resultados.reduce((s, v) => s + v, 0) + info.mod;
    const criticos = info.lados === 20 && resultados.length === 1 && resultados[0] === 20 ? "\n🎉 CRÍTICO!" : info.lados === 20 && resultados.length === 1 && resultados[0] === 1 ? "\n💀 FALHA CRÍTICA!" : "";
    texto = `🎲 ${info.qtd > 1 ? `${info.qtd}` : ""}d${info.lados}${fmt(info.mod)} \`[${resultados.join(", ")}]\` → **${total}**${criticos}`;
  }
  return texto;
}

async function abrirSite(alvo) {
  const t = String(alvo || "").trim();
  if (t.startsWith("http")) {
    const r = await focarNaAba(t);
    return r.ok ? `🔗 Abri ${t} no navegador.` : `❌ ${r.erro || "Falha."}`;
  }
  const comp = t.toLowerCase();
  const site = SITES.find((s) => s.alias.some((a) => comp.includes(a)));
  if (!site) {
    const r = await pc.abrirUrl("https://www.google.com/search?q=" + encodeURIComponent(comp));
    return r.ok ? `🔍 Abri busca no Google por "${comp}".` : `❌ ${r.erro}`;
  }
  const r = await focarNaAba(site.url);
  return r.ok ? `🔗 Abri **${site.nome}** (${site.url}).` : `❌ Não consegui abrir.`;
}

async function executar(args) {
  const pedido = String(args || "").trim();

  if (!pedido) {
    return [
      "🎲 **Modo RPG** (por texto — Neon fora da call)",
      "",
      "**Links rápidos:** `zacarias` · `campanha` · `escudo` · `mapa` · `links`",
      "  *Manda `mapa <link>` pra atualizar o link do mapa.*",
      "",
      "**Rolls:** `1d20+3` · `2d6` · `d100` · `d20 vantagem` · `d20 desvantagem`",
      "",
      "**Sites:** `abre dnd5e` · `abre ordem` · `abre roll20` · `abre <site>`",
    ].join("\n");
  }

  const lower = pedido.toLowerCase();

  if (lower === "links") return formatarLinks();

  if (lower === "zacarias") return abrirLink("zacarias");
  if (lower === "campanha") return abrirLink("campanha");
  if (lower === "escudo") return abrirLink("escudo");
  if (lower === "mapa" || lower.startsWith("mapa ")) {
    if (lower === "mapa") return abrirLink("mapa");
    return salvarNovoMapa(pedido.replace(/^mapa\s+/i, "").trim());
  }

  const abre = pedido.match(/^abre?\s+(.+)$/i);
  if (abre) return abrirSite(abre[1]);

  const info = interpretaRoll(pedido);
  if (info) {
    if (info.invalido) return `❌ ${info.invalido}`;
    return executarRoll(info);
  }

  return "❌ Não entendi. Tenta: `1d20+3`, `2d6`, `d20 vantagem`, `zacarias`, `campanha`, `escudo`, `mapa <link>`, `links`, `abre dnd5e`.";
}

module.exports = {
  nome: "modo_rpg",
  descricao: `Assistente de RPG de mesa (Ordem Paranormal) por texto. Abre/foca abas no navegador: "zacarias" (personagem), "campanha", "escudo" (escudo do mestre), "mapa <link>" (atualiza e abre o mapa), "links". Também ROLA dados: 1d20+3, 2d6, d100, d20 vantagem/desvantagem. E abre sites: "abre <site/url>". Uso: skill_modo_rpg | [comando]`,
  executar,
};