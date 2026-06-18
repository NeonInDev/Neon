const { log } = require("./logger");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let browser = null;
let pagina = null;
const WHATSAPP_URL = "https://web.whatsapp.com";
const OPERA_PATH = "C:\\Users\\Pichau\\AppData\\Local\\Programs\\Opera GX\\opera.exe";
const USER_DATA = "C:\\Users\\Pichau\\AppData\\Local\\neon_whatsapp_profile";

async function getBrowser() {
  if (browser && browser.connected) { try { await browser.pages(); return browser; } catch {} }
  try { await browser?.close(); } catch {}
  browser = null;
  const puppeteer = require("puppeteer");
  browser = await puppeteer.launch({
    executablePath: OPERA_PATH,
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      `--user-data-dir=${USER_DATA}`,
    ],
  });
  return browser;
}

async function abrirWhatsApp() {
  const b = await getBrowser();
  pagina = await b.newPage();
  await pagina.goto(WHATSAPP_URL, { waitUntil: "networkidle2", timeout: 60000 });
  await pagina.setViewport({ width: 1280, height: 800 });
  return pagina;
}

async function enviarMensagem(contato, mensagem) {
  try {
    if (!pagina || pagina.isClosed()) await abrirWhatsApp();
    await pagina.bringToFront();
    await sleep(3000);

    const searchBox = await pagina.waitForSelector('div[contenteditable="true"][data-tab="3"]', { timeout: 30000 }).catch(() => null);
    if (!searchBox) throw new Error("WhatsApp nao esta logado. Abra o navegador e escaneie o QR code.");

    await searchBox.click();
    await searchBox.type(contato, { delay: 80 });
    await sleep(2000);

    const contact = await pagina.waitForSelector('span[title*="' + contato.replace(/"/g, "") + '"]', { timeout: 10000 }).catch(() => null);
    if (!contact) throw new Error("Contato '" + contato + "' nao encontrado. Verifique o nome e tente novamente.");
    await contact.click();
    await sleep(1500);

    const msgBox = await pagina.waitForSelector('div[contenteditable="true"][data-tab="10"]', { timeout: 10000 });
    await msgBox.type(mensagem, { delay: 30 });
    await sleep(500);

    const sendBtn = await pagina.$('button[data-testid="compose-btn-send"]') || await pagina.$('span[data-testid="send"]');
    if (sendBtn) {
      await sendBtn.click();
    } else {
      await msgBox.focus();
      await pagina.keyboard.press("Enter");
    }
    await sleep(1000);
    log("INFO", "[WHATSAPP] Mensagem enviada", { contato, mensagem: mensagem.slice(0, 60) });
    return `📱 Mensagem enviada para ${contato} no WhatsApp.`;
  } catch (err) {
    log("WARN", "[WHATSAPP] Erro", { erro: err.message });
    throw err;
  }
}

async function verificarLogin() {
  try {
    if (!pagina || pagina.isClosed()) return false;
    const exists = await pagina.$('div[contenteditable="true"][data-tab="3"]').catch(() => null);
    return !!exists;
  } catch { return false; }
}

module.exports = { enviarMensagem, abrirWhatsApp, verificarLogin };
