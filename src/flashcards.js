const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

const FC_PATH = path.join(__dirname, "..", "flashcards.json");
const INTERVALOS = [1, 2, 4, 8, 16, 32];

let dados = { decks: {} };
try {
  if (fs.existsSync(FC_PATH)) {
    dados = JSON.parse(fs.readFileSync(FC_PATH, "utf8"));
    if (!dados.decks) dados.decks = {};
  }
} catch (err) {
  log("WARN", "[FLASHCARDS] Falha ao ler flashcards.json", { erro: err.message });
}

const pendentes = {};

function salvar() {
  try {
    fs.writeFileSync(FC_PATH, JSON.stringify(dados, null, 2), "utf8");
  } catch (err) {
    log("ERROR", "[FLASHCARDS] Falha ao salvar", { erro: err.message });
  }
}

function slugDeck(s) {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function garantirDeck(nome) {
  const key = slugDeck(nome);
  if (!key) return null;
  if (!dados.decks[key]) dados.decks[key] = { nome: nome.trim(), cartas: [] };
  return key;
}

function criarDeck(nome) {
  const key = garantirDeck(nome);
  salvar();
  const qtd = dados.decks[key].cartas.length;
  return { ok: true, mensagem: `🗂️ Deck **${nome.trim()}** pronto (${qtd} carta(s)). Adiciona assim: \`add carta ${nome.trim()}: frente | verso\`` };
}

function adicionarCarta(deck, frente, verso) {
  const key = slugDeck(deck);
  if (!dados.decks[key]) return { ok: false, erro: `Deck "${deck}" não existe. Cria primeiro: \`criar deck ${deck}\`` };
  if (!frente || !verso) return { ok: false, erro: "Precisa de frente E verso." };
  dados.decks[key].cartas.push({ frente: frente.trim(), verso: verso.trim(), reps: 0, intervaloDias: 0, proxima: hoje() });
  salvar();
  log("INFO", "[FLASHCARDS] Carta adicionada", { deck: key });
  return { ok: true, mensagem: `🃏 Carta adicionada em **${dados.decks[key].nome}** (${dados.decks[key].cartas.length} total).` };
}

function listarDecks() {
  const keys = Object.keys(dados.decks);
  if (!keys.length) return { ok: true, mensagem: "📭 Nenhum deck ainda. Cria um: `criar deck geografia`" };
  const linhas = keys.map((k) => {
    const d = dados.decks[k];
    const paraHoje = d.cartas.filter((c) => !c.proxima || c.proxima <= hoje()).length;
    return `• **${d.nome}** — ${d.cartas.length} carta(s), ${paraHoje} pra revisar hoje`;
  });
  return { ok: true, mensagem: "🗂️ **Seus decks:**\n" + linhas.join("\n") };
}

function proximaDoDeck(key) {
  const d = dados.decks[key];
  if (!d) return null;
  const h = hoje();
  const idx = d.cartas.findIndex((c) => !c.proxima || c.proxima <= h);
  return idx >= 0 ? { idx, carta: d.cartas[idx], total: d.cartas.length, restantes: d.cartas.filter((c) => !c.proxima || c.proxima <= h).length } : null;
}

function iniciarEstudo(userId, nomeDeck) {
  const key = slugDeck(nomeDeck);
  if (!dados.decks[key]) return { ok: false, erro: `Deck "${nomeDeck}" não existe.` };
  const p = proximaDoDeck(key);
  if (!p) return { ok: true, mensagem: `✅ Nada pra revisar em **${dados.decks[key].nome}** hoje! Todas as ${dados.decks[key].cartas.length} cartas tão agendadas pra depois.` };
  pendentes[String(userId)] = { deck: key, idx: p.idx };
  return {
    ok: true,
    mensagem: `🎯 **${dados.decks[key].nome}** — ${p.restantes} carta(s) pra hoje.\n\n❓ ${p.carta.frente}\n\n_(responde \`sei\` ou \`não sei\` — depois de pensar, viu?)_`,
  };
}

function avaliar(userId, acertou) {
  const st = pendentes[String(userId)];
  if (!st) return { ok: false, erro: "Não tem carta pendente. Usa `estudar <deck>`." };
  const deck = dados.decks[st.deck];
  const carta = deck && deck.cartas[st.idx];
  delete pendentes[String(userId)];
  if (!carta) return { ok: false, erro: "Carta sumiu do baralho, algo estranho aconteceu." };
  if (acertou) {
    carta.reps = (carta.reps || 0) + 1;
    const nivel = Math.min(carta.reps - 1, INTERVALOS.length - 1);
    carta.intervaloDias = INTERVALOS[nivel];
  } else {
    carta.reps = 0;
    carta.intervaloDias = 1;
  }
  const prox = new Date();
  prox.setDate(prox.getDate() + carta.intervaloDias);
  carta.proxima = `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, "0")}-${String(prox.getDate()).padStart(2, "0")}`;
  salvar();
  log("INFO", "[FLASHCARDS] Avaliada", { deck: st.deck, acertou, intervaloDias: carta.intervaloDias });

  let msg = `${acertou ? "✅ Isso!" : "❌ Quase!"} Resposta: **${carta.verso}**\n📅 Próxima revisão em ${carta.intervaloDias} dia(s).`;
  const proxima = proximaDoDeck(st.deck);
  if (proxima) {
    pendentes[String(userId)] = { deck: st.deck, idx: proxima.idx };
    msg += `\n\n❓ Próxima: ${proxima.carta.frente}\n\n_(\`sei\` ou \`não sei\` · \`cancelar estudo\` pra parar)_`;
  } else {
    msg += `\n\n🎉 Acabaram as cartas de **${deck.nome}** por hoje!`;
  }
  return { ok: true, mensagem: msg };
}

function cancelarEstudo(userId) {
  if (pendentes[String(userId)]) {
    delete pendentes[String(userId)];
    return { ok: true, mensagem: "👋 Estudo pausado. Volta quando quiser com `estudar <deck>`." };
  }
  return { ok: false, erro: "Não tem estudo rolando." };
}

function temPendente(userId) {
  return !!pendentes[String(userId)];
}

function resetarDeck(nome) {
  const key = slugDeck(nome);
  if (!dados.decks[key]) return { ok: false, erro: `Deck "${nome}" não existe.` };
  for (const c of dados.decks[key].cartas) {
    c.reps = 0;
    c.intervaloDias = 0;
    c.proxima = hoje();
  }
  salvar();
  return { ok: true, mensagem: `🔄 Deck **${dados.decks[key].nome}** resetado — todas as cartas voltaram pra hoje.` };
}

module.exports = {
  criarDeck,
  adicionarCarta,
  listarDecks,
  iniciarEstudo,
  avaliar,
  cancelarEstudo,
  temPendente,
  resetarDeck,
};
