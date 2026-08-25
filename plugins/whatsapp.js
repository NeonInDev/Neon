const fs = require("fs");
const path = require("path");
const { log } = require("../src/logger");

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const qrcodePng = require("qrcode");

const SESSION_DIR = path.join(__dirname, "..", ".whatsapp");
const QR_FILE = path.join(__dirname, "..", "whatsapp_qr.txt");

const ASSINATURA = "\n\n_Enviado pela Neon_";

let client = null;
let estado = "desconectado";
let ultimoQr = "";
let watchdog = null;
let fechamento = null;
let inicializando = false;
const gruposConhecidos = {};

function assinar(texto) {
  const limpo = String(texto || "").replace(/\s*_Enviado pela Neon_\s*$/i, "").trim();
  return `${limpo}${ASSINATURA}`;
}

function limparWatchdog() {
  if (watchdog) {
    clearTimeout(watchdog);
    watchdog = null;
  }
}

function agendarWatchdog() {
  limparWatchdog();
  watchdog = setTimeout(() => {
    watchdog = null;
    if (estado !== "conectado" && client) {
      log("WARN", "[WHATSAPP] Restauração travou — reinicializando cliente");
      client.destroy().catch(() => {});
      client = null;
      estado = "desconectado";
      setTimeout(() => iniciar().catch(() => {}), 3000);
    }
  }, 45000);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function agendarFechamento() {
  if (fechamento) clearTimeout(fechamento);
  fechamento = setTimeout(() => {
    fechamento = null;
    parar().catch((err) => log("WARN", "[WHATSAPP] Falha ao fechar após inatividade", { erro: err.message }));
  }, 20000);
}

async function garantirIniciado() {
  if (!client && !inicializando) await iniciar();
  while (inicializando) await sleep(250);
}

async function iniciar() {
  if (client || inicializando) return;
  inicializando = true;
  try {

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
    puppeteer: {
      headless: false,
      executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1280,860", "--start-minimized"],
    },
  });

  client.on("qr", (qr) => {
    estado = "qr";
    ultimoQr = qr;
    fs.writeFileSync(QR_FILE, qr, "utf8");
    console.log("\n========== WHATSAPP - ESCANEIE O QR ==========");
    qrcode.generate(qr, { small: true });
    console.log("==============================================\n");
    log("INFO", "[WHATSAPP] QR gerado — escaneie no celular");
  });

  client.on("authenticated", () => {
    estado = "autenticando";
    agendarWatchdog();
    log("INFO", "[WHATSAPP] Autenticado");
  });

  client.on("ready", () => {
    estado = "conectado";
    limparWatchdog();
    log("INFO", "[WHATSAPP] Conectado e pronto!");
    setTimeout(() => {
      try {
        module.exports.fecharModais().catch(() => {});
      } catch {}
    }, 8000);
  });

  client.on("message", async (msg) => {
    try {
      const corpo = String(msg.body || "");
      const autor = msg.from || "?";
      let chatId = autor;
      try {
        const dados = msg._data || {};
        const remoto = dados.remote || (dados.id && dados.id.remote) || "";
        if (remoto) chatId = remoto;
      } catch {}
      if (/^\/status$/i.test(corpo.trim())) {
        await client.sendMessage(chatId, assinar(`📡 Neon WhatsApp online. Conectado: ${client.info?.pushname || client.info?.wid?.user || "?"}`));
        return;
      }
      const ehGrupo = chatId.includes("@g.us") || autor.includes("@g.us");
      if (ehGrupo) {
        let nome = chatId;
        try {
          const chat = await msg.getChat();
          if (chat && chat.name) nome = chat.name;
        } catch {}
        gruposConhecidos[nome] = chatId;
        log("INFO", `[WHATSAPP] Grupo ${nome} (${chatId}): ${corpo.slice(0, 80)}`);
      } else {
        log("INFO", `[WHATSAPP] Msg de ${autor} (chat ${chatId}): ${corpo.slice(0, 80)}`);
      }
    } catch (err) {
      log("ERROR", "[WHATSAPP] Erro ao tratar mensagem", { erro: err.message });
    }
  });

  client.on("disconnected", (motivo) => {
    estado = "desconectado";
    limparWatchdog();
    log("WARN", `[WHATSAPP] Desconectado: ${motivo}`);
  });

  try {
    await client.initialize();
  } catch (err) {
    log("ERROR", "[WHATSAPP] Falha ao inicializar", { erro: err.message });
    try { await client.destroy(); } catch {}
    client = null;
    estado = "desconectado";
    setTimeout(() => iniciar().catch(() => {}), 12000);
  }

  } finally {
    inicializando = false;
  }
}

async function parar() {
  limparWatchdog();
  if (fechamento) {
    clearTimeout(fechamento);
    fechamento = null;
  }
  if (client) {
    try { await client.destroy(); } catch {}
    client = null;
  }
  estado = "desconectado";
}

async function enviar(destino, texto) {
  await garantirIniciado();
  if (!client || estado !== "conectado") {
    return { ok: false, erro: `WhatsApp não conectado (estado: ${estado}). Reinicie a Neon e escaneie o QR.` };
  }
  let numero = String(destino || "").replace(/[^\d]/g, "");
  if (/^\d{10,12}$/.test(numero) && !numero.startsWith("55")) numero = `55${numero}`;
  if (!/^55\d{10,12}$/.test(numero)) {
    return { ok: false, erro: `Número inválido: "${destino}". Use com DDI (ex: 5571999999999).` };
  }
  const chatId = `${numero}@c.us`;
  const mensagem = assinar(texto);
  try {
    let alvo = chatId;
    try {
      const id = await client.getNumberId(numero);
      if (id?._serialized) alvo = id._serialized;
    } catch {}
    await client.sendMessage(alvo, mensagem);
    agendarFechamento();
    return { ok: true, numero, mensagem, alvo };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

module.exports = {
  nome: "WhatsApp",
  versao: "1.0",
  desc: "Integracao com WhatsApp Web (enviar mensagens e notificacoes). Toda mensagem sai com '_Enviado pela Neon_' em italico.",

  async iniciar() {
    await iniciar();
  },

  async parar() {
    await parar();
  },

  status() {
    return { estado, conectado: estado === "conectado", temQr: !!ultimoQr };
  },

  async qrPng() {
    if (!ultimoQr) return null;
    try {
      return await qrcodePng.toBuffer(ultimoQr, { type: "png", width: 240, margin: 1 });
    } catch (err) {
      log("ERROR", "[WHATSAPP] Falha ao gerar QR PNG", { erro: err.message });
      return null;
    }
  },

  enviar,
  assinar,

  async listarGrupos() {
    if (!client || estado !== "conectado") return { ok: false, erro: "WhatsApp não conectado" };
    try {
      let grupos = [];
      let debug = {};
      for (let tentativa = 0; tentativa < 5; tentativa++) {
        try {
          const res = await client.pupPage.evaluate(() => {
            const out = {};
            if (window.WWebJS && typeof window.WWebJS.getChats === "function") {
              out.ww = true;
            } else {
              out.ww = false;
            }
            const ChatModel = window.require("WAWebChatModel").Chat;
            const chats = ChatModel && typeof ChatModel.getModelsArray === "function" ? ChatModel.getModelsArray() : [];
            return {
              out,
              chats: chats.filter((c) => c.isGroup).map((c) => ({ id: c.id._serialized, nome: c.name || "" })),
              totChats: chats.length,
            };
          });
          debug = res;
          grupos = res.chats;
          if (grupos.length) break;
        } catch (err) {
          debug = { erro: err.message };
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      return { ok: true, grupos, debug };
    } catch (err) {
      log("ERROR", "[WHATSAPP] listarGrupos falhou", { erro: err.message, stack: String(err.stack).slice(0, 400) });
      return { ok: false, erro: err.message, stack: String(err.stack).slice(0, 300) };
    }
  },

  async encontrarGrupo(nome) {
    if (!client || estado !== "conectado") return { ok: false, erro: "WhatsApp não conectado" };
    const chave = String(nome).toLowerCase();
    const entrada = Object.entries(gruposConhecidos).find(([n]) => n.toLowerCase().includes(chave));
    if (entrada) return { ok: true, id: entrada[1], nome: entrada[0] };
    try {
      const r = await listarGrupos();
      if (!r.ok) return r;
      const alvo = r.grupos.find((g) => g.nome && g.nome.toLowerCase().includes(chave));
      if (!alvo) return { ok: false, erro: `Grupo "${nome}" não encontrado`, grupos: r.grupos.slice(0, 30) };
      return { ok: true, id: alvo.id, nome: alvo.nome };
    } catch (err) {
      log("ERROR", "[WHATSAPP] encontrarGrupo falhou", { erro: err.message });
      return { ok: false, erro: err.message };
    }
  },

  async enviarDocumento(destino, caminhoArquivo, caption) {
    await garantirIniciado();
    if (!client || estado !== "conectado") {
      return { ok: false, erro: `WhatsApp não conectado (estado: ${estado}).` };
    }
    if (!fs.existsSync(caminhoArquivo)) {
      return { ok: false, erro: `Arquivo não encontrado: ${caminhoArquivo}` };
    }
    try {
      const media = MessageMedia.fromFilePath(caminhoArquivo);
      const legenda = caption ? assinar(caption) : assinar("Documento da Neon");
      await client.sendMessage(destino, media, { caption: legenda });
      agendarFechamento();
      return { ok: true, destino, arquivo: path.basename(caminhoArquivo), caption: legenda };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  },

  gruposConhecidos() {
    return { ok: true, grupos: Object.entries(gruposConhecidos).map(([nome, id]) => ({ nome, id })) };
  },

  async enviarRaw(destino, texto) {
    await garantirIniciado();
    if (!client || estado !== "conectado") {
      return { ok: false, erro: `WhatsApp não conectado (estado: ${estado}).` };
    }
    const alvo = String(destino || "").trim();
    if (!alvo.includes("@")) {
      return { ok: false, erro: "Destino deve ser um id (ex: 120363...@g.us ou 5571...@c.us)" };
    }
    try {
      await client.sendMessage(alvo, assinar(texto));
      agendarFechamento();
      return { ok: true, destino: alvo, mensagem: assinar(texto) };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  },

  async abrirConversa(termo) {
    await garantirIniciado();
    if (!client || estado !== "conectado") {
      return { ok: false, erro: `WhatsApp não conectado (estado: ${estado}).` };
    }
    const alvo = String(termo || "").trim().toLowerCase();
    if (!alvo) return { ok: false, erro: "termo obrigatório" };
    try {
      const rect = await client.pupPage.evaluate((t) => {
        const norm = (s) => String(s || "").replace(/[\u200b-\u200f\u202a-\u202e]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
        const itens = [...document.querySelectorAll('[data-testid^="list-item-"]')];
        const vistos = [];
        let parcial = null;
        const pegar = (it, titulo) => {
          it.scrollIntoView({ block: "center" });
          const r = it.getBoundingClientRect();
          if (r.width < 10 || r.height < 10) return null;
          if (r.bottom < 0 || r.top > window.innerHeight) return null;
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, titulo: String(titulo.textContent).trim() };
        };
        for (const it of itens) {
          const titulo = it.querySelector('[data-testid="cell-frame-title"]');
          if (!titulo) continue;
          const txt = norm(titulo.textContent);
          if (vistos.length < 25) vistos.push(String(titulo.textContent).trim());
          if (txt === t) {
            const p = pegar(it, titulo);
            if (p) return p;
          }
          if (!parcial && txt.includes(t)) parcial = { it, titulo };
        }
        if (parcial) {
          const p = pegar(parcial.it, parcial.titulo);
          if (p) return p;
        }
        return { naoAchou: true, vistos };
      }, alvo);
      if (!rect || rect.naoAchou) {
        const focou = await client.pupPage.evaluate(() => {
          const cont = document.querySelector('[data-testid="chat-list-search-container"]');
          const el = cont && (cont.querySelector("input") || cont.querySelector('[contenteditable="true"]'));
          if (el) { el.focus(); return true; }
          return false;
        });
        if (!focou) return { ok: false, erro: "conversa não achada na lista e busca indisponível", vistos: rect ? rect.vistos : [] };
        await client.pupPage.keyboard.type(alvo, { delay: 60 });
        await sleep(3000);
        const resBusca = await client.pupPage.evaluate((t) => {
          const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
          const itens = [...document.querySelectorAll('[data-testid^="list-item-"]')];
          for (const it of itens) {
            const titulo = it.querySelector('[data-testid="cell-frame-title"]');
            if (titulo && norm(titulo.textContent) === t) {
              it.scrollIntoView({ block: "center" });
              const r = it.getBoundingClientRect();
              return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            }
          }
          return null;
        }, alvo);
        if (resBusca) {
          await client.pupPage.mouse.click(resBusca.x, resBusca.y);
          await sleep(1800);
          agendarFechamento();
          return { ok: true, via: "busca-click", termo: alvo };
        }
        await client.pupPage.keyboard.press("Escape");
        return { ok: false, erro: "não encontrado nem na lista nem na busca", vistos: rect ? rect.vistos : [] };
      }
      await client.pupPage.mouse.click(rect.x, rect.y);
      await sleep(1800);
      agendarFechamento();
      return { ok: true, via: "mouse", titulo: rect.titulo };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  },

  async enviarUI(texto) {
    await garantirIniciado();
    if (!client || estado !== "conectado") {
      return { ok: false, erro: `WhatsApp não conectado (estado: ${estado}).` };
    }
    try {
      const okComposer = await client.pupPage.evaluate(() => {
        const sel = [
          '[data-testid="conversation-compose-box-input"]',
          'footer div[contenteditable="true"]',
          'div[contenteditable="true"][data-tab]',
        ];
        for (const s of sel) {
          const el = document.querySelector(s);
          if (el) { el.focus(); return true; }
        }
        return false;
      });
      if (!okComposer) return { ok: false, erro: "caixa de mensagem não encontrada (conversa aberta?)" };
      await client.pupPage.evaluate((txt) => {
        const el =
          document.querySelector('[data-testid="conversation-compose-box-input"]') ||
          document.querySelector('footer div[contenteditable="true"]') ||
          document.querySelector('div[contenteditable="true"][data-tab]');
        if (!el) return false;
        el.focus();
        document.execCommand("insertText", false, txt);
        return true;
      }, String(texto));
      await sleep(400);
      await client.pupPage.keyboard.press("Enter");
      await sleep(600);
      agendarFechamento();
      return { ok: true, via: "ui", texto };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  },

  async enviarDocUI(caminhoArquivo, legenda) {
    await garantirIniciado();
    if (!client || estado !== "conectado") {
      return { ok: false, erro: `WhatsApp não conectado (estado: ${estado}).` };
    }
    const fs = require("fs");
    const caminho = String(caminhoArquivo || "");
    if (!fs.existsSync(caminho)) return { ok: false, erro: `arquivo não encontrado: ${caminho}` };
    try {
      const clicouAnexo = await client.pupPage.evaluate(() => {
        const norm = (s) => String(s || "").trim().toLowerCase();
        let alvo = document.querySelector('[data-testid="attach"]');
        let via = "testid";
        if (!alvo) {
          alvo = [...document.querySelectorAll('[aria-label],button,[role="button"]')]
            .find((b) => /anexar|attach/.test(norm(b.getAttribute("aria-label"))));
          via = "aria";
        }
        if (!alvo) {
          const ic = document.querySelector('span[data-icon="plus"],span[data-icon="clip"]');
          if (ic) { alvo = ic.closest('button,[role="button"],div[role="button"]') || ic; via = "icone"; }
        }
        if (!alvo) return { falhou: true, motivo: "nenhum candidato" };
        const r = alvo.getBoundingClientRect();
        if (r.width < 5) return { falhou: true, motivo: `invisível (${via})`, rect: `${r.x},${r.y} ${r.width}x${r.height}` };
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, via, tag: alvo.tagName, info: String(alvo.outerHTML || "").slice(0, 120) };
      });
      if (clicouAnexo.falhou) return { ok: false, erro: `botão de anexar não encontrado: ${clicouAnexo.motivo}` };
      await client.pupPage.mouse.click(clicouAnexo.x, clicouAnexo.y);
      await sleep(1000);

      const clicouDoc = await client.pupPage.evaluate(() => {
        const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
        const cand = [...document.querySelectorAll('li,[role="option"],[role="menuitem"],div[role="button"],[role="listitem"]')];
        const alvo = cand.find((el) => {
          const t = norm(el.textContent);
          return /^documentos?$/.test(t) || (t.includes("documento") && t.length < 40);
        });
        if (!alvo) {
          const textos = cand.map((el) => norm(el.textContent)).filter((t) => t && t.length < 40);
          return { falhou: true, opcoes: [...new Set(textos)].slice(0, 25) };
        }
        const r = alvo.getBoundingClientRect();
        if (r.width < 5) return { falhou: true, opcoes: ["elemento encontrado mas invisível"] };
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (clicouDoc.falhou) {
        await client.pupPage.keyboard.press("Escape");
        return { ok: false, erro: "opção Documento não apareceu no menu de anexos", opcoesMenu: clicouDoc.opcoes, anexoVia: clicouAnexo.via, anexoInfo: clicouAnexo.info };
      }
      await client.pupPage.mouse.click(clicouDoc.x, clicouDoc.y);
      await sleep(1200);

      const inputHandle = await client.pupPage.$('input[type="file"][accept*="pdf"],input[type="file"][accept*="doc"],input[type="file"]');
      if (!inputHandle) return { ok: false, erro: "input de arquivo não encontrado" };
      await inputHandle.uploadFile(caminho);
      await sleep(2500);

      if (legenda) {
        const okCaption = await client.pupPage.evaluate((cap) => {
          const el =
            document.querySelector('[data-testid="caption-input"]') ||
            document.querySelector('footer div[contenteditable="true"]') ||
            document.querySelector('div[contenteditable="true"][data-tab]');
          if (!el) return false;
          el.focus();
          document.execCommand("insertText", false, cap);
          return true;
        }, assinar(String(legenda)));
        if (!okCaption) return { ok: false, erro: "caixa de legenda não encontrada (upload falhou?)" };
        await sleep(500);
      }
      await client.pupPage.keyboard.press("Enter");
      await sleep(1500);
      agendarFechamento();
      return { ok: true, via: "ui-doc", arquivo: caminho };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  },

  async infoChat(id) {
    if (!client || estado !== "conectado") return { ok: false, erro: "WhatsApp não conectado" };
    try {
      const chat = await client.getChatById(String(id));
      return { ok: true, id: String(id), nome: chat.name || chat.formattedTitle || "?", grupo: !!chat.isGroup };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  },

  async entrarGrupo(linkOuCodigo) {
    if (!client || estado !== "conectado") return { ok: false, erro: "WhatsApp não conectado" };
    try {
      let codigo = String(linkOuCodigo || "").trim();
      const m = codigo.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{15,})/);
      if (m) codigo = m[1];
      if (!/^[A-Za-z0-9_-]{15,}$/.test(codigo)) return { ok: false, erro: `Link/código inválido: "${linkOuCodigo}"` };
      const id = await client.acceptInvite(codigo);
      const gid = typeof id === "string" ? id : id && id._serialized;
      let nome = gid;
      try {
        const chat = await client.getChatById(gid);
        if (chat && chat.name) nome = chat.name;
        gruposConhecidos[nome] = gid;
      } catch {}
      log("INFO", `[WHATSAPP] Grupo via link: ${nome} (${gid})`);
      return { ok: true, id: gid, nome };
    } catch (err) {
      log("ERROR", "[WHATSAPP] entrarGrupo falhou", { erro: err.message });
      return { ok: false, erro: err.message };
    }
  },

  async debugPagina() {
    if (!client || estado !== "conectado") return { ok: false, erro: "WhatsApp não conectado" };
    try {
      const res = await client.pupPage.evaluate(() => {
        const saida = { url: location.href.slice(0, 60) };
        try { saida.temBusca = !!document.querySelector('div[contenteditable="true"][data-tab="3"]'); } catch {}
        try { saida.temBusca2 = !!document.querySelector('[data-testid="chat-list-search"]'); } catch {}
        try { saida.temChatList = !!document.querySelector('[data-testid="chat-list"]'); } catch {}
        try {
          saida.qtdDataId = document.querySelectorAll('[data-id]').length;
        } catch {}
        try {
          saida.listitems = document.querySelectorAll('[role="listitem"]').length;
        } catch {}
        try {
          saida.texto = String(document.body.innerText || "").replace(/\s+/g, " ").slice(0, 250);
        } catch {}
        try {
          const h = document.querySelector('[data-testid="conversation-info-header"]');
          saida.header = h ? String(h.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80) : "";
        } catch {}
        try {
          const testids = new Set();
          for (const el of document.querySelectorAll("[data-testid]")) testids.add(el.getAttribute("data-testid"));
          saida.testids = [...testids].slice(0, 80);
        } catch {}
        try {
          saida.editables = [...document.querySelectorAll('[contenteditable="true"]')].map((e) => `${e.tagName.toLowerCase()}[data-tab="${e.getAttribute("data-tab")}"]`).slice(0, 10);
        } catch {}
        try {
          saida.botoes = [...document.querySelectorAll('button, [role="button"]')]
            .map((b) => ({
              t: String(b.textContent || "").trim().slice(0, 40),
              a: b.getAttribute("aria-label") || "",
              id: b.getAttribute("data-testid") || "",
            }))
            .filter((b) => b.t || b.a || b.id)
            .slice(0, 30);
        } catch {}
        return saida;
      });
      return { ok: true, ...res };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  },

  async fecharModais() {
    if (!client || !client.pupPage) return { ok: false, erro: "WhatsApp não conectado" };
    try {
      let res = { clicados: [] };
      for (let tent = 0; tent < 3 && !res.clicados.length; tent++) {
        res = await client.pupPage.evaluate(() => {
          const limpar = (s) => String(s || "").normalize("NFKC").replace(/[\u200B-\u200D\uFEFF\s]+/g, " ").trim();
          const clicados = [];
          const todos = [...document.querySelectorAll('button, [role="button"]')];
          let alvo = todos.find((b) => /^continuar$/i.test(limpar(b.textContent)));
          if (!alvo) alvo = todos.find((b) => limpar(b.getAttribute("aria-label")) === "Fechar");
          if (!alvo) alvo = todos.find((b) => /continuar|entendi|come.?ar/i.test(limpar(b.textContent)));
          if (alvo) {
            alvo.click();
            clicados.push(limpar(alvo.textContent || alvo.getAttribute("aria-label")).slice(0, 40));
          }
          return { clicados };
        });
        if (!res.clicados.length) await new Promise((r) => setTimeout(r, 2500));
      }
      await new Promise((r) => setTimeout(r, 2500));
      const depois = await client.pupPage.evaluate(() => {
        const itens = document.querySelectorAll("[data-id]");
        const chats = [];
        for (const el of itens) {
          const id = el.getAttribute("data-id") || "";
          if (!id || !id.includes("@")) continue;
          const nomeEl = el.querySelector('[data-testid="conversation-info-header"] span');
          chats.push({ id, nome: nomeEl ? nomeEl.textContent.trim() : id });
        }
        return { dataId: itens.length, chats: chats.slice(0, 30) };
      });
      log("INFO", `[WHATSAPP] Modais: ${JSON.stringify(res)} -> ${JSON.stringify(depois).slice(0, 300)}`);
      return { ok: true, ...res, ...depois };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  },

  async inspecionar(termo) {
    if (!client || !client.pupPage) return { ok: false, erro: "WhatsApp não conectado" };
    const alvo = String(termo || "");
    try {
      const res = await client.pupPage.evaluate((alvo) => {
        const norm = (s) => String(s || "").replace(/\s+/g, " ");
        const todos = [...document.querySelectorAll("*")];
        const casam = todos.filter((el) => {
          const t = norm(el.textContent || "");
          if (!t || !t.toLowerCase().includes(alvo.toLowerCase())) return false;
          return ![...el.children].some((f) => norm(f.textContent || "").toLowerCase().includes(alvo.toLowerCase()));
        });
        return casam.slice(0, 6).map((el) => {
          const attrs = {};
          for (const a of el.attributes) attrs[a.name] = a.value.slice(0, 120);
          const dumpVal = (obj, prof) => {
            try {
              if (obj === null || obj === undefined) return String(obj);
              const t = typeof obj;
              if (t === "string") return obj.slice(0, 90);
              if (t === "number" || t === "boolean") return obj;
              if (t === "function") return "[fn]";
              if (prof > 6) return "…";
              if (Array.isArray(obj)) return obj.slice(0, 4).map((x) => dumpVal(x, prof + 1));
              const saida = {};
              for (const k of Object.keys(obj).slice(0, 30)) saida[k] = dumpVal(obj[k], prof + 1);
              return saida;
            } catch { return "[err]"; }
          };
          let btn = null;
          let node = el;
          for (let i = 0; i < 12 && node; i++, node = node.parentElement) {
            if (node.tagName === "BUTTON") { btn = node; break; }
          }
          let propsBtn = null;
          if (btn) {
            const pk = Object.keys(btn).find((k) => k.startsWith("__reactProps$"));
            if (pk) propsBtn = JSON.stringify(dumpVal(btn[pk], 0)).slice(0, 1800);
          }
          const chaves = [];
          node = el;
          for (let i = 0; i < 12 && node; i++, node = node.parentElement) {
            const ks = Object.keys(node).filter((k) => /react|fiber|props|redux|mobx/i.test(k));
            if (ks.length) chaves.push({ nivel: i, tag: node.tagName, chaves: ks });
          }
          return { tag: el.tagName, attrs, propsBtn, chaves, html: el.outerHTML.slice(0, 400) };
        });
      }, alvo);
      return { ok: true, alvo, encontrados: res.length, elementos: res };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  },

  async clicarTexto(termo) {
    if (!client || !client.pupPage) return { ok: false, erro: "WhatsApp não conectado" };
    const alvo = String(termo || "");
    try {
      const res = await client.pupPage.evaluate((alvo) => {
        const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
        const todos = [...document.querySelectorAll("*")];
        const folha = todos.find((el) => {
          const t = norm(el.textContent || "").toLowerCase();
          if (!t.startsWith(alvo.toLowerCase())) return false;
          return ![...el.children].some((f) => norm(f.textContent || "").toLowerCase().startsWith(alvo.toLowerCase()));
        });
        if (!folha) return { clicou: false, motivo: "texto nao encontrado" };
        let node = folha;
        for (let i = 0; i < 15 && node; i++, node = node.parentElement) {
          const pk = Object.keys(node).find((k) => k.startsWith("__reactProps$"));
          if (pk && node[pk] && typeof node[pk].onClick === "function") {
            try { node[pk].onClick({ stopPropagation() {}, preventDefault() {}, persist() {} }); } catch {}
            node.click();
            return { clicou: true, via: `onClick nivel ${i}`, tag: node.tagName };
          }
        }
        folha.click();
        return { clicou: true, via: "click direto na folha", tag: folha.tagName };
      }, alvo);
      await new Promise((r) => setTimeout(r, 2000));
      return { ok: true, ...res };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  },

  async extrairIds() {
    if (!client || !client.pupPage) return { ok: false, erro: "WhatsApp não conectado" };
    try {
      const res = await client.pupPage.evaluate((seletorEscopo) => {
        const porId = {};
        const coletar = (obj, prof, saco, visitados) => {
          if (!obj || prof > 8 || saco.length) return;
          if (typeof obj === "string") {
            const m = obj.match(/\d{5,}@(?:g\.us|c\.us)/);
            if (m && !saco.includes(m[0])) saco.push(m[0]);
            return;
          }
          if (typeof obj !== "object" || visitados.has(obj)) return;
          visitados.add(obj);
          for (const chave of ["_serialized", "serialized", "remote", "wid", "id", "from", "to", "author", "participant"]) {
            let v = null;
            try { v = obj[chave]; } catch { continue; }
            if (typeof v === "string") {
              const m = v.match(/\d{5,}@(?:g\.us|c\.us)/);
              if (m && !saco.includes(m[0])) saco.push(m[0]);
            }
          }
          if (saco.length) {
            let nm = "";
            for (const ck of ["name", "formattedTitle", "pushname"]) {
              try { const t = obj[ck]; if (typeof t === "string" && t.trim()) { nm = t.trim(); break; } } catch {}
            }
            if (nm) saco.nm = nm;
            return;
          }
          let chaves = [];
          try { chaves = Object.keys(obj); } catch { return; }
          for (const k of chaves.slice(0, 40)) {
            try { coletar(obj[k], prof + 1, saco, visitados); } catch {}
            if (saco.length) return;
          }
        };
        const raiz = (typeof seletorEscopo === "string" && seletorEscopo && document.querySelector(seletorEscopo)) || document.body;
        const candidatos = [...raiz.querySelectorAll("*")];
        for (const el of candidatos) {
          let fk = null;
          for (const k of Object.keys(el)) { if (k.startsWith("__reactFiber$")) { fk = k; break; } }
          if (!fk) continue;
          const saco = [];
          const visitados = new WeakSet();
          let fib = el[fk];
          let guard = 0;
          while (fib && guard++ < 15 && !saco.length) {
            if (fib.memoizedProps && typeof fib.memoizedProps === "object") {
              coletar(fib.memoizedProps, 0, saco, visitados);
            }
            fib = fib.return;
          }
          if (!saco.length) continue;
          const rotulo = String(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50);
          for (const id of saco) {
            if (!porId[id]) porId[id] = { rotulos: [], nomes: [] };
            if (saco.nm && !porId[id].nomes.includes(saco.nm)) porId[id].nomes.push(saco.nm);
            if (!porId[id].rotulos.includes(rotulo)) porId[id].rotulos.push(rotulo);
          }
        }
        return Object.entries(porId).map(([id, v]) => ({ id, nomes: v.nomes.slice(0, 3), rotulos: v.rotulos.slice(0, 3) }));
      });
      return { ok: true, total: res.length, itens: res };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  },

  async diagFiber(termo) {
    if (!client || !client.pupPage) return { ok: false, erro: "WhatsApp não conectado" };
    const alvo = String(termo || "");
    try {
      const res = await client.pupPage.evaluate((alvo) => {
        const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
        const todos = [...document.querySelectorAll("span, div")];
        const alvoEl = todos.find((el) => {
          const t = norm(el.getAttribute && el.getAttribute("title") || "");
          return t.toLowerCase().includes(alvo.toLowerCase());
        });
        if (!alvoEl) return { achou: false };
        const fk = Object.keys(alvoEl).find((k) => k.startsWith("__reactFiber$"));
        if (!fk) return { achou: true, fiber: false };
        const cadeia = [];
        let fib = alvoEl[fk];
        let guard = 0;
        while (fib && guard++ < 25) {
          const info = {
            nivel: guard,
            tag: fib.tag || (typeof fib.type === "function" ? "[fn]" : String(fib.type || "")),
            propsKeys: [],
            temContexto: !!fib.memoizedContext,
          };
          try { info.propsKeys = Object.keys(fib.memoizedProps || {}).slice(0, 20); } catch {}
          cadeia.push(info);
          fib = fib.return;
        }
        return { achou: true, fiber: true, cadeia };
      }, alvo);
      return { ok: true, ...res };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  },

  async buscarChat(nome) {
    if (!client || estado !== "conectado") return { ok: false, erro: "WhatsApp não conectado" };
    const alvo = String(nome || "");
    try {
      const sel = 'div[contenteditable="true"][data-tab="3"]';
      const temCampo = await client.pupPage.evaluate((s) => !!document.querySelector(s), sel);
      if (!temCampo) return { ok: false, erro: "Campo de busca não encontrado" };
      await client.pupPage.click(sel);
      await client.pupPage.keyboard.down("Control");
      await client.pupPage.keyboard.press("A");
      await client.pupPage.keyboard.up("Control");
      await client.pupPage.keyboard.press("Backspace");
      await new Promise((r) => setTimeout(r, 300));
      await client.pupPage.type(sel, alvo, { delay: 30 });
      await new Promise((r) => setTimeout(r, 2500));
      const res = await client.pupPage.evaluate(() => {
        const itens = document.querySelectorAll('[data-id]');
        const vistos = new Set();
        const resultados = [];
        for (const el of itens) {
          const id = el.getAttribute("data-id") || "";
          if (vistos.has(id)) continue;
          vistos.add(id);
          let nome = id;
          const titulo = el.querySelector('[data-testid="conversation-info-header"]');
          const nomeEl = titulo ? titulo.querySelector("span") : null;
          if (nomeEl && nomeEl.textContent) nome = nomeEl.textContent.trim();
          else if (el.getAttribute("aria-label")) nome = el.getAttribute("aria-label");
          resultados.push({ id, nome });
        }
        return { resultados: resultados.slice(0, 25) };
      });
      await client.pupPage.keyboard.press("Escape");
      return { ok: true, alvo, ...res };
    } catch (err) {
      return { ok: false, erro: err.message, stack: String(err.stack).slice(0, 300) };
    }
  },

  ferramentas: [
    {
      nome: "whatsapp_enviar",
      desc: "Envia mensagem no WhatsApp (assinatura automatica). Uso: whatsapp_enviar | numero=5571999999999, mensagem=texto",
      async executar(args) {
        const m = String(args || "").match(/(?:numero|n)=(\d+)/i);
        const t = String(args || "").match(/(?:mensagem|texto|msg)=([^]*)/i);
        if (!m) return "❌ Uso: whatsapp_enviar | numero=5571999999999, mensagem=texto";
        const r = await enviar(m[1], (t ? t[1] : "").replace(/^.*mensagem=/i, "").trim());
        return r.ok ? `✅ WhatsApp enviado para ${r.numero}.` : `❌ ${r.erro}`;
      },
    },
  ],

  acoes: [],
};