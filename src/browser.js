const { log } = require("./logger");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(execCb);

let browser = null;
const OPERA_PATH = "C:\\Users\\Pichau\\AppData\\Local\\Programs\\Opera GX\\opera.exe";
const USER_DATA = "C:\\Users\\Pichau\\AppData\\Local\\neon_opera_profile";
const DEBUG_PORT = 9222;

// Abre URL no navegador padrão do usuário (reusa janela existente, nova aba)
async function abrirUrlNoOpera(url) {
  await execAsync(`start "" "${url}"`);
}

async function iniciar() {
  // Se já temos um browser conectado, reusa
  if (browser) {
    try {
      if (browser.connected) {
        await browser.pages();
        return browser;
      }
    } catch {}
    try { await browser.close(); } catch {}
    browser = null;
  }

  const puppeteer = require("puppeteer");

  // Tenta conectar num Opera já aberto (com debug port)
  try {
    browser = await puppeteer.connect({
      browserURL: `http://localhost:${DEBUG_PORT}`,
    });
    log("INFO", "[BROWSER] Conectado ao Opera existente");
    return browser;
  } catch {
    log("INFO", "[BROWSER] Nenhum Opera com debug encontrado, iniciando novo");
  }

  // Abre UM novo Opera (com debug port fixo)
  try {
    browser = await puppeteer.launch({
      executablePath: OPERA_PATH,
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        `--user-data-dir=${USER_DATA}`,
        "--start-maximized",
        `--remote-debugging-port=${DEBUG_PORT}`,
      ],
    });
    log("INFO", "[BROWSER] Opera GX iniciado");
    return browser;
  } catch (err) {
    log("ERROR", "[BROWSER] Falha ao iniciar", { erro: err.message });
    browser = null;
    throw err;
  }
}

// Fecha só a aba, não o navegador inteiro — mantém a janela pra reuso
async function fecharAba(page) {
  if (page && !page.isClosed()) {
    try { await page.close(); } catch {}
  }
}

async function fechar() {
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
    log("INFO", "[BROWSER] Opera GX fechado");
  }
}

async function abrirPagina(url) {
  const b = await iniciar();
  const page = await b.newPage();
  await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
  return page;
}

async function verificar(page, acao) {
  try {
    if (acao.tipo === "pesquisar") {
      const sel = "input[type='text'], input[name='q'], input[type='search'], textarea, input[role='combobox']";
      const el = await page.$(sel);
      if (!el) return { possivel: false, motivo: "Campo de pesquisa não encontrado na página" };
      return { possivel: true };
    }
    if (acao.tipo === "clicar") {
      const el = acao.seletor ? await page.$(acao.seletor) : null;
      if (!el) {
        const elementos = await page.$$("a, button, [role='button'], [onclick]");
        for (const e of elementos) {
          const texto = await e.evaluate(el => el.textContent.toLowerCase().trim());
          if (texto.includes(acao.texto.toLowerCase())) {
            return { possivel: true, elemento: e };
          }
        }
        return { possivel: false, motivo: `Elemento "${acao.texto}" não encontrado` };
      }
      return { possivel: true, elemento: el };
    }
    if (acao.tipo === "digitar") {
      const sel = "input[type='text'], input:not([type]), textarea, [contenteditable='true']";
      const el = await page.$(sel);
      if (!el) return { possivel: false, motivo: "Nenhum campo de texto encontrado" };
      return { possivel: true };
    }
    if (acao.tipo === "pip") {
      const video = await page.$("video");
      if (!video) return { possivel: false, motivo: "Nenhum vídeo encontrado na página" };
      return { possivel: true };
    }
    return { possivel: true };
  } catch (err) {
    return { possivel: false, motivo: err.message };
  }
}

async function executarAcao(page, acao) {
  const check = await verificar(page, acao);
  if (!check.possivel) throw new Error(check.motivo);

  if (acao.tipo === "pesquisar") {
    const sel = "input[type='text'], input[name='q'], input[type='search'], textarea, input[role='combobox']";
    const el = await page.$(sel);
    await el.click({ clickCount: 3 });
    await el.type(acao.termo, { delay: 60 });
    await page.keyboard.press("Enter");
    await sleep(2000);
  }

  if (acao.tipo === "clicar") {
    const el = check.elemento;
    await el.evaluate(el => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    await sleep(300);
    await el.click();
    await sleep(1500);
  }

  if (acao.tipo === "digitar") {
    const sel = "input[type='text'], input:not([type]), textarea, [contenteditable='true']";
    const el = await page.$(sel);
    await el.click({ clickCount: 3 });
    await el.type(acao.texto, { delay: 50 });
  }

  if (acao.tipo === "escrever") {
    const sel = "input[type='text'], input:not([type]), textarea, [contenteditable='true']";
    let el = acao.seletor ? await page.$(`input[name='${acao.seletor}'], input[placeholder*='${acao.seletor}'], input[id*='${acao.seletor}'], label:has-text('${acao.seletor}') + input`) : null;
    if (!el) el = await page.$(sel);
    await el.click({ clickCount: 3 });
    await el.type(acao.texto, { delay: 50 });
  }

  if (acao.tipo === "extrair") {
    let el;
    if (acao.seletor && acao.seletor !== "pagina" && acao.seletor !== "página") {
      el = await page.$(`p, h1, h2, h3, h4, span, div, a, li, ${acao.seletor}`);
    }
    if (!el) el = await page.$("body");
    const textoExtraido = await el.evaluate(el => el.textContent.trim().slice(0, 3000));
    acao.textoExtraido = textoExtraido;
  }

  if (acao.tipo === "esperar") {
    await sleep(acao.tempo || 2000);
  }

  if (acao.tipo === "scrollar") {
    const amount = acao.quantidade;
    if (amount === -99999) {
      await page.evaluate(() => window.scrollTo(0, 0));
    } else if (amount === 99999) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    } else {
      await page.evaluate((q) => window.scrollBy(0, q), amount);
    }
  }

  if (acao.tipo === "pip") {
    const video = await page.$("video");
    const pipSupported = await page.evaluate(() => "requestPictureInPicture" in document.createElement("video"));
    if (!pipSupported) throw new Error("Navegador não suporta PiP");
    await page.evaluate(() => {
      const v = document.querySelector("video");
      if (v && !document.pictureInPictureElement) v.requestPictureInPicture();
    });
    await sleep(1000);
  }
}

async function interpretar(texto) {
  const lower = texto.toLowerCase().trim();
  let m = lower.match(/^(?:entra|entrar|vai|vá|ir|abre|abrir|navega|navegar)(?:\s+(?:no|na|em|para))?\s+(\S+?)(?:\s+(?:e\s+)?(.+))?$/i);
  if (m) {
    let site = m[1];
    if (!/^https?:\/\//i.test(site)) site = "https://" + site;
    const acaoTexto = m[2]?.trim();
    if (acaoTexto && acaoTexto.length > 0) {
      return { acao: "navegar_e_fazer", site, acaoTexto };
    }
    return { acao: "navegar", site };
  }
  return null;
}

async function interpretarAcaoTexto(texto) {
  const lower = texto.toLowerCase().trim();

  // YouTube-specific: "coloca/toca X", "coloca/toca o vídeo", "assiste X"
  let m = lower.match(/^(?:coloca|colocar|toca|tocar|assiste|assistir|play|da play|dá play)\s+(?:o\s+)?(?:(?:vídeo|video)\s+)?(.+)/i);
  if (m) return { tipo: "tocar_video", termo: m[1].trim() };

  m = lower.match(/^(?:pesquisa|pesquisar|busca|buscar|search)\s+(.+?)(?:\s+e\s+(?:coloca|colocar|toca|tocar|da play|dá play|play|assiste|assistir|pip|picture in picture)\s*(?:(?:o|a|em)\s+)?(?:video|vídeo|ele|ela|pip)?)?\s*$/i);
  if (m) return { tipo: "tocar_video", termo: m[1].trim() };

  m = lower.match(/^(?:clica|clicar|click|aperta|apertar|entra|entrar|toca|tocar em)\s+(?:em\s+|no|na|em)?(.+)/i);
  if (m) return { tipo: "clicar", texto: m[1].trim() };

  m = lower.match(/^(?:digita|digitar|type)\s+(.+)/i);
  if (m) return { tipo: "digitar", texto: m[1].trim() };

  m = lower.match(/^(?:escreve|escrever|preenche|preencher)\s+(?:em\s+|no|na)?(.+?)(?:\s+(?:com|:|,)\s+(.+))/i);
  if (m) return { tipo: "escrever", seletor: m[1].trim(), texto: m[2].trim() };

  m = lower.match(/^(?:espera|esperar|wait|aguarda|aguardar)\s+(\d+)/i);
  if (m) return { tipo: "esperar", tempo: parseInt(m[1]) * 1000 };

  m = lower.match(/^(?:rola|rolar|scroll|scrollar|desce|descer|sobe|subir)\s+(?:para\s+|ate\s+)?(baixo|cima|topo|fim|fundo|(\d+))/i);
  if (m) {
    if (m[1] === "topo" || m[1] === "cima") return { tipo: "scrollar", quantidade: -99999 };
    if (m[1] === "fim" || m[1] === "fundo" || m[1] === "baixo") return { tipo: "scrollar", quantidade: 99999 };
    return { tipo: "scrollar", quantidade: m[2] ? parseInt(m[2]) : 500 };
  }

  m = lower.match(/^(?:extrai|extrair|pega|pegar|captura|capturar|ler|lê)\s+(?:o\s+)?(?:texto\s+)?(?:da\s+|do\s+)?(.+)/i);
  if (m) return { tipo: "extrair", seletor: m[1].trim() };

  m = lower.match(/^(?:pip|picture in picture|tela flutuante|mini player)/i);
  if (m) return { tipo: "pip" };

  return null;
}

async function pesquisarYouTube(page, termo) {
  // Espera o campo de busca carregar
  const searchBox = await page.waitForSelector("input#search, input[name='search_query'], input[aria-label='Pesquisar'], input[aria-label='Search']", { timeout: 10000 });
  if (!searchBox) throw new Error("Campo de busca do YouTube não encontrado");
  await searchBox.click({ clickCount: 3 });
  await searchBox.type(termo, { delay: 80 });
  await page.keyboard.press("Enter");
  // Aguarda os resultados carregarem
  await sleep(5000);

  // Tenta clicar no primeiro vídeo por vários seletores
  const selectors = [
    "ytd-video-renderer:first-child a#thumbnail",
    "ytd-video-renderer a#thumbnail",
    "ytd-item-section-renderer a#thumbnail",
    "#contents ytd-video-renderer:first-child a#thumbnail",
    "a#video-title",
    "ytd-video-renderer:first-child",
    "ytd-video-renderer:first-child ytd-thumbnail a",
  ];
  for (const sel of selectors) {
    const vids = await page.$$(sel);
    for (const vid of vids) {
      try {
        await vid.evaluate(el => el.scrollIntoView({ behavior: "smooth", block: "center" }));
        await sleep(300);
        await vid.click();
        await sleep(3000);
        return;
      } catch {}
    }
  }

  // Fallback: navega via teclado
  await page.keyboard.press("Tab");
  await sleep(500);
  await page.keyboard.press("Tab");
  await sleep(500);
  await page.keyboard.press("Enter");
  await sleep(3000);
}

async function executarRoteiro(texto) {
  const cmd = await interpretar(texto);
  if (!cmd) return null;

  try {
    if (cmd.acao === "navegar") {
      const page = await abrirPagina(cmd.site);
      log("INFO", "[BROWSER] Página aberta", { site: cmd.site });
      return { ok: true, msg: `🌐 Abri ${cmd.site} no Opera GX.` };
    }

    if (cmd.acao === "navegar_e_fazer") {
      const page = await abrirPagina(cmd.site);
      const acao = await interpretarAcaoTexto(cmd.acaoTexto);
      if (!acao) return { ok: true, msg: `🌐 Abri ${cmd.site}, mas não entendi a ação "${cmd.acaoTexto}".` };

      try {
        const isYouTube = cmd.site.includes("youtube.com") || cmd.site.includes("youtu.be");

        if (isYouTube && acao.tipo === "tocar_video") {
          await pesquisarYouTube(page, acao.termo);
          // Verifica se o texto original pedia PiP
          const pediuPip = cmd.acaoTexto.toLowerCase().includes("pip") || cmd.acaoTexto.toLowerCase().includes("picture in picture") || cmd.acaoTexto.toLowerCase().includes("tela flutuante") || cmd.acaoTexto.toLowerCase().includes("mini player");
          if (pediuPip) {
            try {
              await executarAcao(page, { tipo: "pip" });
              return { ok: true, msg: `🎬 Toquei "${acao.termo}" no YouTube com PiP.` };
            } catch {
              return { ok: true, msg: `🎬 Toquei "${acao.termo}" no YouTube, mas não consegui ativar PiP.` };
            }
          }
          return { ok: true, msg: `🎬 Toquei "${acao.termo}" no YouTube.` };
        }

        if (isYouTube && acao.tipo === "pesquisar") {
          await pesquisarYouTube(page, acao.termo);
          return { ok: true, msg: `🎬 Pesquisei e toquei "${acao.termo}" no YouTube.` };
        }

        await executarAcao(page, acao);
        let descricao = "";
        if (acao.tipo === "pesquisar") descricao = `pesquisei "${acao.termo}"`;
        if (acao.tipo === "clicar") descricao = `cliquei em "${acao.texto}"`;
        if (acao.tipo === "digitar") descricao = `digitei "${acao.texto}"`;
        if (acao.tipo === "escrever") descricao = `escrevi "${acao.texto}" no campo`;
        if (acao.tipo === "extrair") descricao = `extraí o texto da página:\n\n${acao.textoExtraido || "(vazio)"}`;
        if (acao.tipo === "pip") descricao = `ativei o picture-in-picture`;
        return { ok: true, msg: `🌐 Abri ${cmd.site} e ${descricao}.` };
      } catch (err) {
        return { ok: true, msg: `🌐 Abri ${cmd.site}, mas não consegui ${cmd.acaoTexto}: ${err.message}` };
      }
    }
  } catch (err) {
    log("ERROR", "[BROWSER] Erro", { erro: err.message });
    return { ok: false, msg: `❌ Erro no navegador: ${err.message}` };
  }

  return null;
}

// ─── Spotify Web ───
async function tocarSpotify(termo) {
  const page = await abrirPagina(`https://open.spotify.com/search/${encodeURIComponent(termo)}`);
  // Espera a página de busca carregar — até 15s
  await sleep(4000);
  try {
    await page.waitForSelector("[data-testid='search-page'], section[data-testid='search-page'], div[role='row'], a[href*='/track/']", { timeout: 15000 });
  } catch {}
  await sleep(2000);

  // Estratégia 1: botão de play no primeiro resultado (vários seletores)
  const playSelectors = [
    "div[data-testid='search-page'] section:first-of-type div[role='row']:first-child button[data-testid='play-button']",
    "div[data-testid='search-page'] div[data-testid='track-list'] div[role='row']:first-child button",
    "div[data-testid='tracklist-row']:first-child button[data-testid='play-button']",
    "div[data-testid='tracklist-row']:first-child button",
    "section[data-testid='search-page'] div[role='row']:first-child div[role='cell']:nth-child(2) button",
    "[data-testid='herocard'] button",
    "button[data-testid='play-button']",
    "[role='row']:first-child button:has(svg)",
    "[role='row']:first-child button svg",
  ];
  for (const sel of playSelectors) {
    const btns = await page.$$(sel);
    for (const btn of btns) {
      try {
        await btn.evaluate(el => el.scrollIntoView({ block: "center" }));
        await sleep(300);
        await btn.click();
        await sleep(2000);
        return `🎵 Tocando "${termo}" no Spotify Web.`;
      } catch {}
    }
  }

  // Estratégia 2: clica no primeiro link de track, depois espera tocar
  const trackLinks = await page.$$("a[href*='/track/']");
  if (trackLinks.length > 0) {
    try {
      await trackLinks[0].click();
      await sleep(4000);
      // Tenta clicar em play na página da track
      const playBtns = await page.$$("button[data-testid='play-button'], button[aria-label*='Play'], button[aria-label*='Tocar']");
      for (const btn of playBtns) {
        try {
          await btn.click();
          await sleep(2000);
          return `🎵 Tocando "${termo}" no Spotify Web.`;
        } catch {}
      }
      return `🎵 Abri "${termo}" no Spotify Web.`;
    } catch {}
  }

  // Estratégia 3: pressiona Enter no primeiro item
  try {
    const primeiroItem = await page.$("div[role='row']:first-child, [data-testid='tracklist-row']:first-child");
    if (primeiroItem) {
      await primeiroItem.click();
      await sleep(1000);
      await page.keyboard.press("Enter");
      await sleep(3000);
      return `🎵 Tocando "${termo}" no Spotify Web.`;
    }
  } catch {}

  throw new Error("Não achei resultados no Spotify Web");
}

// ─── YouTube — busca por HTTP + abre no navegador do usuário ───
const recentVideoIds = new Set();
const MAX_RECENT_VIDEOS = 5;

async function pesquisarVideoId(termo, skip = 0) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(termo)}`;
  const { data } = await require("axios").get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
    timeout: 15000,
  });
  const matches = [...data.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
  if (matches.length === 0) throw new Error("Não encontrei o vídeo no YouTube");
  // Pula os 'skip' primeiros resultados (pra "outro video")
  let videoId = null;
  let idx = skip;
  for (let i = skip; i < matches.length; i++) {
    if (!recentVideoIds.has(matches[i][1])) { videoId = matches[i][1]; idx = i; break; }
  }
  if (!videoId) videoId = matches[skip]?.[1] || matches[0][1];
  recentVideoIds.add(videoId);
  if (recentVideoIds.size > MAX_RECENT_VIDEOS) {
    const primeiro = recentVideoIds.values().next().value;
    recentVideoIds.delete(primeiro);
  }
  return videoId;
}

async function tocarVideoYouTube(termo, skip = 0) {
  const videoId = await pesquisarVideoId(termo, skip);
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  await abrirUrlNoOpera(url);
  return `🎬 Tocando "${termo}" no YouTube.`;
}

module.exports = { executarRoteiro, fechar, fecharAba, abrirPagina, interpretarAcaoTexto, executarAcao, tocarSpotify, tocarVideoYouTube, abrirUrlNoOpera };
