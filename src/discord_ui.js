// Automação de UI do Discord Web (sua conta, não a do bot).
// Segue o mesmo padrão do plugin de WhatsApp: navegador visível + perfil salvo.
// Ações: abrir DM, enviar mensagem, fazer chamada de voz — tudo na interface.

const { log } = require("./logger");
const { resolverUsuario } = require("./discord_msg");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OPERA_PATH = "C:\\Users\\Pichau\\AppData\\Local\\Programs\\Opera GX\\opera.exe";
const USER_DATA = "C:\\Users\\Pichau\\AppData\\Local\\neon_discord_profile";

let pwBrowser = null;
let pagina = null;
let inicializando = false;
let fechamento = null;

function agendarFechamento(ms = 240000) {
  if (fechamento) clearTimeout(fechamento);
  fechamento = setTimeout(() => {
    fechamento = null;
    parar().catch((err) => log("WARN", "[DISCORD_UI] Falha ao fechar por inatividade", { erro: err.message }));
  }, ms);
}

async function garantirIniciado() {
  if (pwBrowser && pagina) {
    try { await pagina.title(); return true; } catch {}
  }
  try { await parar(); } catch {}
  if (inicializando) { while (inicializando) await sleep(250); return !!pwBrowser; }
  inicializando = true;
  try {
    const { chromium } = require("playwright");
    pwBrowser = await chromium.launch({
      executablePath: OPERA_PATH,
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        `--user-data-dir=${USER_DATA}`,
        "--window-size=1380,900",
      ],
    });
    pagina = pwBrowser.pages()[0] || (await pwBrowser.newPage());
    pagina.on("pageerror", (err) => log("CHROME", `[DISCORD_UI] pageerror: ${err.message}`));
    log("INFO", "[DISCORD_UI] Navegador iniciado (perfil dedicado)");
    return true;
  } catch (err) {
    log("ERROR", "[DISCORD_UI] Falha ao iniciar navegador", { erro: err.message });
    pwBrowser = null;
    pagina = null;
    return false;
  } finally {
    inicializando = false;
  }
}

async function parar() {
  if (fechamento) { clearTimeout(fechamento); fechamento = null; }
  if (pwBrowser) {
    try { await pwBrowser.close(); } catch {}
  }
  pwBrowser = null;
  pagina = null;
  log("INFO", "[DISCORD_UI] Navegador fechado");
}

// Navega direto pro DM pelo ID real da pessoa (resolve "fulano"/"123" -> id).
async function abrirDM(alvo) {
  if (!(await garantirIniciado())) return { ok: false, erro: "Não consegui abrir o navegador do Discord" };
  const user = await resolverUsuario(alvo);
  if (!user) return { ok: false, erro: `Não achei ninguém chamado "${alvo}"` };
  const url = `https://discord.com/channels/@me/${user.id}`;
  try {
    await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(3500);
    const logado = await pagina.evaluate(() => !!document.querySelector('div[role="textbox"][contenteditable="true"]'));
    if (!logado) {
      return { ok: false, erro: "Parece que o Discord web não está logado na sua conta. Abra o Discord, faça login uma vez e tente de novo.", precisaLogin: true };
    }
    agendarFechamento();
    return { ok: true, url, usuario: user.username, id: user.id };
  } catch (err) {
    return { ok: false, erro: `Falha ao abrir DM: ${err.message}` };
  }
}

function seletoresCaixaTexto() {
  return [
    'main div[role="textbox"][contenteditable="true"]',
    'main div[role="textbox"]',
    'div[data-slate-editor="true"]',
    'main textarea',
  ];
}

async function focarCaixaTexto() {
  return await pagina.evaluate((sels) => {
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) { el.focus(); el.click(); return true; }
    }
    return false;
  }, seletoresCaixaTexto());
}

async function enviarMensagem(alvo, texto) {
  if (!texto || !String(texto).trim()) return { ok: false, erro: "Mensagem vazia" };
  const aberto = await abrirDM(alvo);
  if (!aberto.ok) return aberto;
  try {
    const okCaixa = await focarCaixaTexto();
    if (!okCaixa) return { ok: false, erro: "Não achei a caixa de mensagem do Discord" };
    await pagina.keyboard.type(String(texto), { delay: 40 });
    await sleep(300);
    await pagina.keyboard.press("Enter");
    await sleep(1200);
    // Confirma que a mensagem apareceu no histórico
    const enviada = await pagina.evaluate((txt) => {
      const lista = document.querySelector('[data-list-id="chat-messages"]') || document.querySelector('main ol') || document.querySelector('main');
      if (!lista) return false;
      const norm = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase();
      const alvo = norm(txt.slice(0, 60));
      return norm(lista.textContent).includes(alvo);
    }, String(texto));
    agendarFechamento();
    if (!enviada) return { ok: false, erro: "Não confirmei que a mensagem foi enviada", possivelmenteEnviada: true };
    return { ok: true, usuario: aberto.usuario, texto: String(texto) };
  } catch (err) {
    return { ok: false, erro: `Falha ao enviar: ${err.message}` };
  }
}

// Clique no botão de chamada de voz do DM (sua conta).
async function ligar(alvo) {
  const aberto = await abrirDM(alvo);
  if (!aberto.ok) return aberto;
  try {
    const clicou = await pagina.evaluate(() => {
      const botoes = [...document.querySelectorAll('button[aria-label]')];
      const alvosBtn = [
        "iniciar chamada", "start call", "iniciar chamada de voz",
        "chamada de voz", "voice call", "ligar", "call",
      ];
      for (const b of botoes) {
        const lbl = (b.getAttribute("aria-label") || "").toLowerCase();
        if (alvosBtn.some((a) => lbl.includes(a)) && !b.disabled) {
          b.click();
          return lbl;
        }
      }
      // fallback: ícone de fone (svg) dentro de botão no header
      const fone = [...document.querySelectorAll('header svg, main svg')].map((s) => s.parentElement).find((p) => p && p.tagName === "BUTTON" && !p.disabled);
      if (fone) { fone.click(); return "fallback-fone"; }
      return null;
    });
    agendarFechamento();
    if (!clicou) return { ok: false, erro: "Não encontrei o botão de chamada de voz nesse DM" };
    return { ok: true, usuario: aberto.usuario, iniciada: clicou };
  } catch (err) {
    return { ok: false, erro: `Falha ao ligar: ${err.message}` };
  }
}

function status() {
  return { aberto: !!(pwBrowser && pagina) };
}

module.exports = { garantirIniciado, parar, abrirDM, enviarMensagem, ligar, status };
