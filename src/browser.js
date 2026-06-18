const { log } = require("./logger");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let browser = null;
const OPERA_PATH = "C:\\Users\\Pichau\\AppData\\Local\\Programs\\Opera GX\\opera.exe";
const USER_DATA = "C:\\Users\\Pichau\\AppData\\Local\\Temp\\neon_opera_profile";

async function iniciar() {
  if (browser) return browser;
  try {
    const puppeteer = require("puppeteer");
    browser = await puppeteer.launch({
      executablePath: OPERA_PATH,
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        `--user-data-dir=${USER_DATA}`,
        "--start-maximized",
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

  if (acao.tipo === "esperar") {
    await sleep(acao.tempo || 2000);
  }

  if (acao.tipo === "scrollar") {
    await page.evaluate(() => window.scrollBy(0, acao.quantidade || 500));
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
  if (m) {
    let termo = m[1].trim();
    return { tipo: "tocar_video", termo };
  }

  m = lower.match(/^(?:clica|clicar|click|aperta|apertar|entra|entrar)\s+(?:em\s+|no|na)?(.+)/i);
  if (m) return { tipo: "clicar", texto: m[1].trim() };

  m = lower.match(/^(?:digita|digitar|type|escreve|escrever)\s+(.+)/i);
  if (m) return { tipo: "digitar", texto: m[1].trim() };

  m = lower.match(/^(?:espera|esperar|wait)\s+(\d+)/i);
  if (m) return { tipo: "esperar", tempo: parseInt(m[1]) * 1000 };

  m = lower.match(/^(?:rola|rolar|scroll|scrollar)\s+(?:para\s+)?(baixo|cima|(\d+))/i);
  if (m) return { tipo: "scrollar", quantidade: m[1] === "cima" ? -500 : m[2] ? parseInt(m[2]) : 500 };

  m = lower.match(/^(?:pip|picture in picture|tela flutuante|mini player)/i);
  if (m) return { tipo: "pip" };

  return null;
}

async function pesquisarYouTube(page, termo) {
  const searchBox = await page.$("input#search, input[name='search_query'], input[aria-label='Pesquisar'], input[aria-label='Search']");
  if (!searchBox) throw new Error("Campo de busca do YouTube não encontrado");
  await searchBox.click({ clickCount: 3 });
  await searchBox.type(termo, { delay: 60 });
  await page.keyboard.press("Enter");
  await sleep(4000);
  // Tenta clicar no primeiro vídeo por vários seletores
  const selectors = [
    "ytd-video-renderer a#thumbnail",
    "ytd-item-section-renderer a#thumbnail",
    "ytd-video-renderer:first-child a#thumbnail",
    "#contents ytd-video-renderer:first-child a#thumbnail",
    "a#video-title",
    "ytd-video-renderer:first-child",
  ];
  let firstVideo = null;
  for (const sel of selectors) {
    firstVideo = await page.$(sel);
    if (firstVideo) break;
  }
  if (firstVideo) {
    await firstVideo.evaluate(el => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    await sleep(300);
    await firstVideo.click();
    await sleep(3000);
    return;
  }
  // Fallback: pressiona Tab + Enter pra navegar no primeiro resultado
  await page.keyboard.press("Tab");
  await sleep(300);
  await page.keyboard.press("Tab");
  await sleep(300);
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
  await sleep(5000);

  // Tenta clicar no primeiro resultado
  const playSelectors = [
    "div[data-testid='tracklist-row']:first-child button[data-testid='play-button']",
    "div[data-testid='tracklist-row']:first-child button",
    "div[data-testid='track-list'] div[role='row']:first-child button",
    "section[data-testid='search-page'] div[role='row']:first-child div[role='cell']:nth-child(2) button",
    "[data-testid='herocard'] button",
  ];
  for (const sel of playSelectors) {
    const btn = await page.$(sel);
    if (btn) {
      await btn.evaluate(el => el.scrollIntoView({ block: "center" }));
      await sleep(500);
      await btn.click();
      await sleep(2000);
      return `🎵 Tocando "${termo}" no Spotify Web.`;
    }
  }

  // Fallback: clica no primeiro card que aparece
  const cards = await page.$$("a[href*='/track/'], div[data-testid='tracklist-row']");
  if (cards.length > 0) {
    await cards[0].click();
    await sleep(3000);
    return `🎵 Tocando "${termo}" no Spotify Web.`;
  }

  throw new Error("Não achei resultados no Spotify Web");
}

// ─── YouTube — pesquisar e tocar direto ───
async function tocarVideoYouTube(termo) {
  const page = await abrirPagina("https://www.youtube.com");
  await pesquisarYouTube(page, termo);
  return `🎬 Tocando "${termo}" no YouTube.`;
}

module.exports = { executarRoteiro, fechar, abrirPagina, interpretarAcaoTexto, executarAcao, tocarSpotify, tocarVideoYouTube };
