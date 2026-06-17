const { log } = require("./logger");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let browser = null;
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function iniciar() {
  if (browser) return browser;
  try {
    const puppeteer = require("puppeteer");
    browser = await puppeteer.launch({
      executablePath: EDGE_PATH,
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    log("INFO", "[BROWSER] Navegador iniciado");
    return browser;
  } catch (err) {
    log("ERROR", "[BROWSER] Falha ao iniciar", { erro: err.message });
    browser = null;
    throw err;
  }
}

async function fechar() {
  if (browser) {
    await browser.close();
    browser = null;
    log("INFO", "[BROWSER] Navegador fechado");
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
      const sel = "input[type='text'], input[name='q'], input[type='search'], textarea";
      const el = await page.$(sel);
      if (!el) return { possivel: false, motivo: "Campo de pesquisa não encontrado na página" };
      return { possivel: true };
    }
    if (acao.tipo === "clicar") {
      const el = await page.$(acao.alvo);
      if (!el) {
        const texto = await page.$$eval("*", (els, t) => {
          return els.find(e => e.textContent.toLowerCase().includes(t.toLowerCase()));
        }, acao.texto);
        if (!texto) return { possivel: false, motivo: `Elemento "${acao.texto}" não encontrado` };
        return { possivel: true, seletor: texto };
      }
      return { possivel: true };
    }
    if (acao.tipo === "digitar") {
      const sel = "input[type='text'], input:not([type]), textarea, [contenteditable='true']";
      const el = await page.$(sel);
      if (!el) return { possivel: false, motivo: "Nenhum campo de texto encontrado" };
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
    const sel = "input[type='text'], input[name='q'], input[type='search'], textarea";
    const el = await page.$(sel);
    await el.click({ clickCount: 3 });
    await el.type(acao.termo, { delay: 50 });
    await page.keyboard.press("Enter");
    await sleep(2000);
  }

  if (acao.tipo === "clicar") {
    const el = check.seletor || (await page.$(acao.alvo));
    await el.click();
    await sleep(1000);
  }

  if (acao.tipo === "digitar") {
    const sel = "input[type='text'], input:not([type]), textarea, [contenteditable='true']";
    const el = await page.$(sel);
    await el.click({ clickCount: 3 });
    await el.type(acao.texto, { delay: 50 });
  }

  if (acao.tipo === "esperar") {
    await page.waitForTimeout(acao.tempo || 2000);
  }

  if (acao.tipo === "scrollar") {
    await page.evaluate(() => window.scrollBy(0, acao.quantidade || 500));
  }
}

async function interpretar(texto) {
  const lower = texto.toLowerCase().trim();

  // "entra no X e pesquisa Y"  ou  "abre X e pesquisa Y"
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

  let m = lower.match(/^(?:pesquisa|pesquisar|busca|buscar|search)\s+(.+)/i);
  if (m) return { tipo: "pesquisar", termo: m[1].trim() };

  m = lower.match(/^(?:clica|clicar|click|aperta|apertar)\s+(?:em\s+)?(.+)/i);
  if (m) return { tipo: "clicar", texto: m[1].trim(), alvo: `text="${m[1].trim()}"` };

  m = lower.match(/^(?:digita|digitar|type|escreve|escrever)\s+(.+)/i);
  if (m) return { tipo: "digitar", texto: m[1].trim() };

  m = lower.match(/^(?:espera|esperar|wait)\s+(\d+)/i);
  if (m) return { tipo: "esperar", tempo: parseInt(m[1]) * 1000 };

  m = lower.match(/^(?:rola|rolar|scroll|scrollar)\s+(?:para\s+)?(baixo|cima|(\d+))/i);
  if (m) return { tipo: "scrollar", quantidade: m[1] === "cima" ? -500 : m[2] ? parseInt(m[2]) : 500 };

  return null;
}

async function executarRoteiro(texto) {
  const cmd = await interpretar(texto);
  if (!cmd) return null;

  try {
    if (cmd.acao === "navegar") {
      const page = await abrirPagina(cmd.site);
      log("INFO", "[BROWSER] Página aberta", { site: cmd.site });
      return { ok: true, msg: `🌐 Abri ${cmd.site} no navegador.` };
    }

    if (cmd.acao === "navegar_e_fazer") {
      const page = await abrirPagina(cmd.site);
      const acao = await interpretarAcaoTexto(cmd.acaoTexto);
      if (!acao) return { ok: true, msg: `🌐 Abri ${cmd.site}, mas não entendi a ação "${cmd.acaoTexto}".` };

      try {
        await executarAcao(page, acao);
        let descricao = "";
        if (acao.tipo === "pesquisar") descricao = `pesquisei "${acao.termo}"`;
        if (acao.tipo === "clicar") descricao = `cliquei em "${acao.texto}"`;
        if (acao.tipo === "digitar") descricao = `digitei "${acao.texto}"`;
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

module.exports = { executarRoteiro, fechar, abrirPagina, interpretarAcaoTexto, executarAcao };
