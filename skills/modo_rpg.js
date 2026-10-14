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
//   skill_modo_rpg | rola Pontaria          → d20 + bônus da perícia (buff salvo)
//   skill_modo_rpg | rola Pontaria+2        → com buff extra
//   skill_modo_rpg | buffs                   → lista perícias + bônus
//   skill_modo_rpg | buff <pericia> <b>      → ajusta o bônus de uma perícia
//
// SITES/RECURSOS:
//   skill_modo_rpg | abre <site>  (dnd5e, ordem, tormenta, roll20, etc.)

const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const pc = require("../src/pc.js");
const rpg = require("../src/rpg.js");

const DEBUG_PORT = 9222;

const OPERA_GX = "C:\\Users\\Pichau\\AppData\\Local\\Programs\\Opera GX\\opera.exe";

const DATA_DIR = path.join(__dirname, "..", "data");
const ARQUIVO_LINKS = path.join(DATA_DIR, "rpg_links.json");
const ARQUIVO_AGENTE = path.join(DATA_DIR, "rpg_agente.json");

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

function operaRodando() {
  try {
    const { execSync } = require("child_process");
    const out = execSync('powershell -NoProfile -NonInteractive -Command "if(Get-Process -Name opera -ErrorAction SilentlyContinue){1}else{0}"', { windowsHide: true, timeout: 8000 }).toString().trim();
    return out === "1";
  } catch {
    return false;
  }
}

async function portaDebugAberta() {
  return new Promise((resolve) => {
    const http = require("http");
    const req = http.get({ host: "127.0.0.1", port: DEBUG_PORT, path: "/json/version", timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
  });
}

async function esperarPortaDebug(tempoMs = 25000) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const check = async () => {
      if (await portaDebugAberta()) return resolve(true);
      if (Date.now() - inicio > tempoMs) return resolve(false);
      setTimeout(check, 500);
    };
    check();
  });
}

function abrirNoOpera(url) {
  return new Promise((resolve) => {
    const child = exec(
      `powershell -NoProfile -NonInteractive -Command "Start-Process -FilePath '${OPERA_GX.replace(/'/g, "''")}' -ArgumentList '${url.replace(/'/g, "''")}'"`,
      { windowsHide: true },
      (err, stdout, stderr) => resolve({ ok: !err, erro: stderr || (err && err.message) })
    );
    child.on("error", () => resolve({ ok: false, erro: "falha ao abrir" }));
    setTimeout(() => { try { child.kill(); } catch {} resolve({ ok: true, timeout: true }); }, 8000);
  });
}

async function focarNaAba(url) {
  const alvo = String(url || "");

  // 1) Se o Opera não está rodando, sobe com porta de debug pra poder focar abas.
  if (!operaRodando() && fs.existsSync(OPERA_GX)) {
    try {
      exec(
        `powershell -NoProfile -NonInteractive -Command "Start-Process -FilePath '${OPERA_GX.replace(/'/g, "''")}' -ArgumentList '--remote-debugging-port=${DEBUG_PORT}'"`,
        { windowsHide: true }
      );
      await esperarPortaDebug(15000);
    } catch (err) {
      console.error("[MODO_RPG] falha ao subir Opera GX com debug", err.message);
    }
  }

  // 2) Se a porta de debug está aberta, conecta via Puppeteer e foca a aba existente.
  if (await portaDebugAberta()) {
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
  }

  // 3) Fallback: abre no Opera GX (nunca no navegador padrão).
  const r = await abrirNoOpera(alvo);
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

function carregarAgente() {
  // Fonte principal: ficha ATIVA em data/rpg_fichas.json (via src/rpg.js).
  try {
    const f = rpg.getFicha(null);
    if (f) {
      const pericias = {};
      for (const [nome, p] of Object.entries(f.pericias?.todos || {})) {
        pericias[nome] = { atributo: p.atributo, bonus: p.bonus };
      }
      return { agente: f.nome, classe: f.classe, origem: f.origem, nex: f.nex, atributos: f.atributos || {}, pericias, ataques: f.ataques || [] };
    }
  } catch {}
  // Fallback: arquivo legado
  try {
    if (!fs.existsSync(ARQUIVO_AGENTE)) return null;
    return JSON.parse(fs.readFileSync(ARQUIVO_AGENTE, "utf8"));
  } catch {
    return null;
  }
}

function salvarAgente(agente) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ARQUIVO_AGENTE, JSON.stringify(agente, null, 2), "utf8");
}

function normalizarNomePericia(txt) {
  const t = String(txt || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const mapa = {
    acrobacia: "Acrobacia", adestramento: "Adestramento", artes: "Artes",
    atletismo: "Atletismo", atualidades: "Atualidades", ciencias: "Ciências",
    crime: "Crime", diplomacia: "Diplomacia", enganacao: "Enganação",
    fortitude: "Fortitude", furtividade: "Furtividade", iniciativa: "Iniciativa",
    intimidacao: "Intimidação", intuicao: "Intuição", investigacao: "Investigação",
    luta: "Luta", medicina: "Medicina", ocultismo: "Ocultismo",
    percepcao: "Percepção", pilotagem: "Pilotagem", pontaria: "Pontaria",
    profissao: "Profissão", reflexos: "Reflexos", religiao: "Religião",
    sobrevivencia: "Sobrevivência", tatica: "Tática", tecnologia: "Tecnologia",
    vontade: "Vontade",
  };
  return mapa[t] || (t.startsWith("percep") ? "Percepção" : null);
}

function formatarBuffs() {
  const agente = carregarAgente();
  if (!agente) return "❌ Nenhuma ficha de agente salva ainda.";
  const atribs = agente.atributos || {};
  const linhas = Object.entries(agente.pericias)
    .map(([nome, p]) => {
      const av = atribs[p.atributo] || 0;
      const total = av + (p.bonus || 0);
      return `• **${nome}** (${p.atributo}${av} + ${p.bonus || 0}) → **+${total}**`;
    })
    .join("\n");
  return [`📋 **Ficha: ${agente.agente}** (${agente.classe} · ${agente.origem} · NEX ${agente.nex})`, "", linhas].join("\n");
}

function definirBuff(alvo) {
  const m = String(alvo || "").match(/^(.+?)\s+([+\-]?\d+)\s*$/);
  if (!m) return "❌ Uso: `buff <perícia> <bônus>` (ex: `buff Pontaria 12`).";
  const nome = normalizarNomePericia(m[1]);
  const valor = parseInt(m[2], 10);
  if (!nome) return `❌ Perícia "${m[1].trim()}" não encontrada.`;
  const r = rpg.definirBonusPericia(nome, valor);
  if (!r.ok) return `❌ ${r.erro}`;
  return `⚡ **${r.nome}** agora com **+${valor}** (ficha ${r.ficha}).`;
}

async function rolarPericia(pedido) {
  const partes = String(pedido).replace(/^rola\w*/i, "").trim();
  const resto = partes.replace(/\b(d20|d100|d6|d12|d8|d10|d4|d2)\b/i, "").trim();
  const extraMatch = partes.match(/([+\-])\s*(\d+)\s*$/);
  const extra = extraMatch ? (extraMatch[1] === "-" ? -parseInt(extraMatch[2], 10) : parseInt(extraMatch[2], 10)) : 0;
  const textoPericia = extraMatch ? partes.slice(0, extraMatch.index).trim() : partes;
  const nome = normalizarNomePericia(textoPericia);
  const agente = carregarAgente();
  if (!nome || !agente || !agente.pericias[nome]) return null;

  const info = agente.pericias[nome];
  const valorAtrib = (agente.atributos || {})[info.atributo] || 0;
  const bonusTotal = valorAtrib + (info.bonus || 0) + extra;
  const fmt = (m) => (m > 0 ? `+${m}` : m < 0 ? `-${Math.abs(m)}` : "");
  const nat = rolar(20, 1)[0];
  const total = nat + bonusTotal;
  const cr = nat === 20 ? " 🎉 CRÍTICO!" : nat === 1 ? " 💀 FALHA CRÍTICA!" : "";
  return `🎲 **${nome}** (${info.atributo}${valorAtrib} ${fmt(info.bonus || 0)}${extra ? ` ${fmt(extra)}` : ""}): d20 → **${nat}** ${fmt(bonusTotal)} = **${total}**${cr}`;
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

// ===== Conteúdo da ficha (rituais, habilidades, itens) =====================
// Le data/rpg_fichas.json via src/rpg.js. Separa por FUNÇÃO, ELEMENTO e itens.

function fmtResumoFicha(f) {
  const a = f.atributos || {};
  const s = f.stats || {};
  const L = [];
  L.push(`📜 **${f.nome}** — ${f.classe || "?"} · ${f.origem || "?"} · NEX ${f.nex || "?"}${f.patente ? ` · ${f.patente}` : ""}`);
  L.push(`🎯 Atributos: FOR ${a.FOR ?? 0} · AGI ${a.AGI ?? 0} · VIG ${a.VIG ?? 0} · INT ${a.INT ?? 0} · PRE ${a.PRE ?? 0}`);
  const c = [];
  if (s.pv) c.push(`PV ${s.pv.atual}/${s.pv.max}`);
  if (s.pe) c.push(`PE ${s.pe.atual}/${s.pe.max}${s.pe.porTurno ? ` (${s.pe.porTurno}/turno)` : ""}`);
  if (s.sanidade) c.push(`SAN ${s.sanidade.atual}/${s.sanidade.max}`);
  if (s.determinacao) c.push(`PD ${s.determinacao.atual}/${s.determinacao.max}`);
  if (s.defesa != null) c.push(`Def ${s.defesa}`);
  if (s.evasao != null) c.push(`Evasão ${s.evasao}`);
  if (s.deslocamento != null) c.push(`Desloc ${s.deslocamento}m`);
  if (s.dtRituais != null) c.push(`DT Rituais ${s.dtRituais}`);
  if (c.length) L.push(`⚔️ ${c.join(" · ")}`);
  const treinadas = f.pericias?.treinadas || [];
  if (treinadas.length) L.push(`🎓 Perícias: ${treinadas.map((p) => `${p.nome} +${p.bonus}`).join(", ")}`);
  if (f.elementos?.length) L.push(`🔮 Elementos: ${f.elementos.join(", ")}`);
  if (f.ataques?.length) L.push(`🗡️ Ataques: ${f.ataques.map((x) => `${x.nome} ${x.dano}`).join(" · ")}`);
  L.push(`📦 ${(f.rituais || []).length} rituais · ${(f.habilidades || []).length} habilidades · ${(f.itens || []).length} itens`);
  L.push(`_Comandos: rituais · ritual <nome> · habilidades · itens · funcao <x> · pericias_`);
  return L.join("\n");
}

function fmtLista(itens, limite = 1400) {
  const linhas = itens.map((x) => {
    const tags = [];
    if (x.circulo) tags.push(`${x.circulo}º círculo`);
    if (x.elemento) tags.push(x.elemento);
    if (x.categoria) tags.push(`cat ${x.categoria}`);
    if (x.equipado) tags.push("equipado");
    return `• **${x.nome}**${tags.length ? ` (${tags.join(", ")})` : ""}: ${x.resumo || x.descricao || "—"}`;
  });
  let txt = linhas.join("\n");
  if (txt.length > limite) txt = txt.slice(0, limite - 1) + "…";
  return txt;
}

function fmtDetalheRitual(r) {
  const L = [`📖 **${r.nome}**${r.circulo ? ` (${r.circulo}º círculo)` : ""}${r.elemento ? ` · ${r.elemento}` : ""}`];
  const info = [];
  if (r.execucao) info.push(`Exec: ${r.execucao}`);
  if (r.alcance) info.push(`Alcance: ${r.alcance}`);
  if (r.alvo) info.push(`Alvo: ${r.alvo}`);
  if (r.area) info.push(`Área: ${r.area}`);
  if (r.duracao) info.push(`Duração: ${r.duracao}`);
  if (r.resistencia) info.push(`Resistência: ${r.resistencia}`);
  if (r.dados && Object.keys(r.dados).length) info.push(`Dano: ${Object.entries(r.dados).map(([k, v]) => `${k} ${v}`).join(" / ")}`);
  if (r.funcoes?.length) info.push(`Funções: ${r.funcoes.join(", ")}`);
  if (info.length) L.push(`⚙️ ${info.join(" · ")}`);
  L.push("");
  L.push(r.descricao || r.resumo || "—");
  return L.join("\n").slice(0, 1900);
}

function fmtDetalheGenerico(x) {
  const L = [`✨ **${x.nome}**`];
  const info = [];
  if (x.tipo) info.push(`Tipo: ${x.tipo}`);
  if (x.elemento) info.push(`Elemento: ${x.elemento}`);
  if (x.categoria) info.push(`Categoria: ${x.categoria}`);
  if (x.slots != null) info.push(`Slots: ${x.slots}`);
  if (x.defesa != null) info.push(`Defesa: +${x.defesa}`);
  if (x.funcoes?.length) info.push(`Funções: ${x.funcoes.join(", ")}`);
  if (info.length) L.push(`⚙️ ${info.join(" · ")}`);
  L.push("");
  L.push(x.descricao || x.resumo || "—");
  if (x.subHabilidades?.length) {
    L.push("");
    L.push("**Sub-habilidades:**");
    for (const h of x.subHabilidades) L.push(`• **${h.nome}**${h.custo ? ` (${h.custo})` : ""}: ${h.resumo || ""}`);
  }
  return L.join("\n").slice(0, 1900);
}

function parseFiltro(resto, ficha) {
  const tokens = String(resto || "").trim().split(/\s+/).filter(Boolean);
  const funcoes = new Set((rpg.todasFuncoes(ficha) || []).map((x) => rpg.normalizar(x)));
  const elementos = new Set(
    [...(ficha.elementos || []), "conhecimento", "energia", "sangue", "morte", "medo", "outro lado"].map((x) => rpg.normalizar(x))
  );
  let funcao = null;
  let elemento = null;
  const busca = [];
  for (const tk of tokens) {
    const n = rpg.normalizar(tk);
    if (!funcao && funcoes.has(n)) { funcao = tk; continue; }
    if (!elemento && elementos.has(n)) { elemento = tk; continue; }
    busca.push(tk);
  }
  return { funcao, elemento, busca: busca.join(" ") || null };
}

function cmdConteudo(pedido, ficha) {
  const lower = pedido.toLowerCase();

  if (lower === "agente" || lower.startsWith("agente ")) {
    const alvo = pedido.replace(/^agente\s*/i, "").trim();
    if (!alvo) return `Ficha ativa: **${ficha.nome}**. Disponíveis: ${rpg.listarFichas().map((x) => x.nome).join(", ")}.`;
    const f = rpg.definirAtiva(alvo);
    return f ? `✅ Ficha ativa agora: **${f.nome}**.` : `❌ Não achei a ficha "${alvo}".`;
  }

  if (lower === "ficha" || lower === "resumo") return fmtResumoFicha(ficha);

  if (lower === "pericias") {
    const tr = ficha.pericias?.treinadas || [];
    if (!tr.length) return "Nenhuma perícia treinada registrada.";
    return [`🎓 **Perícias treinadas — ${ficha.nome}**`, ...tr.map((p) => `• **${p.nome}** (${p.atributo}) +${p.bonus}`)].join("\n");
  }

  if (lower.startsWith("rituais")) {
    const filtro = parseFiltro(pedido.replace(/^rituais\s*/i, ""), ficha);
    const lista = rpg.filtrar(ficha, "rituais", filtro);
    if (!lista.length) return "Nenhum ritual com esse filtro.";
    const head = `📖 **Rituais (${lista.length})**${filtro.funcao ? ` · função ${filtro.funcao}` : ""}${filtro.elemento ? ` · ${filtro.elemento}` : ""}${filtro.busca ? ` · "${filtro.busca}"` : ""}:`;
    return [head, fmtLista(lista), "_Detalhe: ritual <nome>_"].join("\n").slice(0, 1950);
  }

  if (lower.startsWith("ritual ")) {
    const r = rpg.buscarRitual(ficha, pedido.replace(/^ritual\s*/i, "").trim());
    return r ? fmtDetalheRitual(r) : "❌ Ritual não encontrado.";
  }

  if (lower === "habilidades" || lower.startsWith("habilidades ")) {
    const filtro = parseFiltro(pedido.replace(/^habilidades\s*/i, ""), ficha);
    const lista = rpg.filtrar(ficha, "habilidades", filtro);
    if (!lista.length) return "Nenhuma habilidade com esse filtro.";
    const head = `✨ **Habilidades (${lista.length})**${filtro.funcao ? ` · função ${filtro.funcao}` : ""}${filtro.busca ? ` · "${filtro.busca}"` : ""}:`;
    return [head, fmtLista(lista), "_Detalhe: habilidade <nome>_"].join("\n").slice(0, 1950);
  }

  if (lower.startsWith("habilidade ")) {
    const h = rpg.buscarHabilidade(ficha, pedido.replace(/^habilidade\s*/i, "").trim());
    return h ? fmtDetalheGenerico(h) : "❌ Habilidade não encontrada.";
  }

  if (lower === "itens" || lower.startsWith("itens ")) {
    const filtro = parseFiltro(pedido.replace(/^itens\s*/i, ""), ficha);
    const lista = rpg.filtrar(ficha, "itens", filtro);
    if (!lista.length) return "Nenhum item com esse filtro.";
    const head = `📦 **Itens (${lista.length})**${filtro.funcao ? ` · função ${filtro.funcao}` : ""}${filtro.elemento ? ` · ${filtro.elemento}` : ""}:`;
    return [head, fmtLista(lista), "_Detalhe: item <nome>_"].join("\n").slice(0, 1950);
  }

  if (lower.startsWith("item ")) {
    const it = rpg.buscarItem(ficha, pedido.replace(/^item\s*/i, "").trim());
    return it ? fmtDetalheGenerico(it) : "❌ Item não encontrado.";
  }

  if (lower.startsWith("funcao ")) {
    const funcao = pedido.replace(/^funcao\s*/i, "").trim();
    const res = rpg.filtrarTudo(ficha, { funcao });
    const total = res.rituais.length + res.habilidades.length + res.itens.length;
    if (!total) return `Nada com a função "${funcao}".`;
    const L = [`🎯 **Função: ${funcao}** (${total} em ${ficha.nome})`];
    if (res.rituais.length) L.push(`**Rituais:** ${res.rituais.map((x) => x.nome).join(", ")}`);
    if (res.habilidades.length) L.push(`**Habilidades:** ${res.habilidades.map((x) => x.nome).join(", ")}`);
    if (res.itens.length) L.push(`**Itens:** ${res.itens.map((x) => x.nome).join(", ")}`);
    return L.join("\n").slice(0, 1950);
  }

  return null;
}

async function executar(args) {
  let pedido;
  if (typeof args === "string") {
    pedido = args.trim();
  } else if (args && typeof args === "object") {
    if (args.rol !== undefined) pedido = `rola ${String(args.rol).trim()}`;
    else pedido = String(args.comando != null ? args.comando : args.pedido != null ? args.pedido : "").trim();
  } else {
    pedido = String(args || "").trim();
  }

  if (!pedido) {
    return [
      "🎲 **Modo RPG** (por texto — Neon fora da call)",
      "",
      "**Ficha:** `ficha` (resumo) · `rituais [função/elemento]` · `ritual <nome>`",
      "  `habilidades [função]` · `habilidade <nome>` · `itens` · `item <nome>`",
      "  `funcao combate` · `pericias` · `agente <nome>` (troca a ficha ativa)",
      "",
      "**Links rápidos:** `zacarias` · `campanha` · `escudo` · `mapa` · `links`",
      "  *Manda `mapa <link>` pra atualizar o link do mapa.*",
      "",
      "**Rolls:** `1d20+3` · `2d6` · `d100` · `d20 vantagem` · `d20 desvantagem`",
      "**Perícias (usam a ficha):** `rola Pontaria` · `rola Furtividade+2`",
      "**Buffs:** `buffs` (lista) · `buff Pontaria 12` (ajusta)",
      "",
      "**Sites:** `abre dnd5e` · `abre ordem` · `abre roll20` · `abre <site>`",
    ].join("\n");
  }

  const lower = pedido.toLowerCase();

  if (lower === "links") return formatarLinks();

  // Conteúdo da ficha (rituais/habilidades/itens por função, elemento etc.)
  const fichaAtiva = rpg.getFicha(null);
  if (fichaAtiva) {
    const respConteudo = cmdConteudo(pedido, fichaAtiva);
    if (respConteudo) return respConteudo;
  }

  if (lower === "buffs") return formatarBuffs();
  if (lower.startsWith("buff ")) return definirBuff(pedido.replace(/^buff\s+/i, "").trim());

  if (lower === "zacarias") return abrirLink("zacarias");
  if (lower === "campanha") return abrirLink("campanha");
  if (lower === "escudo") return abrirLink("escudo");
  if (lower === "mapa" || lower.startsWith("mapa ")) {
    if (lower === "mapa") return abrirLink("mapa");
    return salvarNovoMapa(pedido.replace(/^mapa\s+/i, "").trim());
  }

  const abre = pedido.match(/^abre?\s+(.+)$/i);
  if (abre) return abrirSite(abre[1]);

  // rola <perícia> => usa o buff salvo
  if (/^rola\w*\s+/i.test(pedido)) {
    const viaPericia = await rolarPericia(pedido);
    if (viaPericia) return viaPericia;
  }

  const info = interpretaRoll(pedido);
  if (info) {
    if (info.invalido) return `❌ ${info.invalido}`;
    return executarRoll(info);
  }

  return "❌ Não entendi. Tenta: `ficha`, `rituais combate`, `ritual <nome>`, `habilidades`, `itens`, `funcao cura`, `rola Pontaria`, `1d20+3`, `2d6`, `buffs`, `zacarias`, `campanha`, `mapa <link>`, `links`, `abre dnd5e`.";
}

module.exports = {
  nome: "modo_rpg",
  descricao: `Assistente de RPG de mesa (Ordem Paranormal) por texto. FICHA (data/rpg_fichas.json): "ficha" (resumo), "rituais [função/elemento]", "ritual <nome>", "habilidades [função]", "habilidade <nome>", "itens", "item <nome>", "funcao <x>" (rituais+habilidades+itens), "pericias", "agente <nome>" (troca a ficha ativa). Abre/foca abas: "zacarias", "campanha", "escudo", "mapa <link>", "links". ROLA dados e PERÍCIAS: "rola Pontaria", "1d20+3", "2d6", "d20 vantagem/desvantagem". "buffs" lista bônus; "buff <perícia> <b>" ajusta. "abre <site>". Uso: skill_modo_rpg | [comando]`,
  executar,
};