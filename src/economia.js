const os = require("os");
const { log } = require("./logger");
const opencode = require("../plugins/opencode");
const { OWNER } = require("./perm");
const fila = require("./fila");

const LIMITE_ENTRAR = 95;
const LIMITE_SAIR = 85;
const CHECK_INTERVALO_MS = 15000;

let client = null;
let timer = null;
let ativo = false;
let ultimoAvisoEntrou = 0;
let ultimoAvisoSaiu = 0;
const AVISO_COOLDOWN_MS = 10 * 60 * 1000;

function ramPercentual() {
  const total = os.totalmem() || 1;
  const livre = os.freemem();
  return Math.round(((total - livre) / total) * 100);
}

async function avisar(texto) {
  if (!client?.isReady()) return;
  try {
    const owner = await client.users.fetch(OWNER);
    await owner.send(texto);
  } catch (err) {
    log("WARN", "[ECONOMIA] Falha ao avisar dono", { erro: err.message });
  }
}

async function entrarEconomia() {
  if (ativo) return;
  ativo = true;
  log("WARN", "[ECONOMIA] Modo economia ATIVADO (RAM alta)");
  opencode.setEconomia(true);
  try {
    opencode.parar();
  } catch {}
  try {
    const filas = fila.listar();
    for (const f of filas) fila.limpar(f.userId);
  } catch {}
  const agora = Date.now();
  if (agora - ultimoAvisoEntrou > AVISO_COOLDOWN_MS) {
    ultimoAvisoEntrou = agora;
    await avisar("⚠️ **Modo economia ativado.**\nSistema sobrecarregado — a Neon pausou o processamento do OpenCode pra aliviar o PC. Vou voltar ao normal quando a RAM abaixar. 🛡️");
  }
}

async function sairEconomia() {
  if (!ativo) return;
  ativo = false;
  log("INFO", "[ECONOMIA] Modo economia DESATIVADO (RAM normal)");
  opencode.setEconomia(false);
  try {
    await opencode.iniciarServer();
  } catch {}
  const agora = Date.now();
  if (agora - ultimoAvisoSaiu > AVISO_COOLDOWN_MS) {
    ultimoAvisoSaiu = agora;
    await avisar("✅ **Modo economia desativado.**\nRAM voltou ao normal — Neon processando normalmente de novo.");
  }
}

async function checar() {
  try {
    const pct = ramPercentual();
    if (pct >= LIMITE_ENTRAR) {
      await entrarEconomia();
    } else if (pct <= LIMITE_SAIR) {
      await sairEconomia();
    }
  } catch (err) {
    log("WARN", "[ECONOMIA] Erro ao checar RAM", { erro: err.message });
  }
}

function iniciar(discordClient) {
  client = discordClient;
  if (timer) clearInterval(timer);
  checar().catch(() => {});
  timer = setInterval(() => checar().catch(() => {}), CHECK_INTERVALO_MS);
  log("INFO", "[ECONOMIA] Monitor de RAM iniciado", { limiteEntrar: `${LIMITE_ENTRAR}%`, limiteSair: `${LIMITE_SAIR}%` });
}

function parar() {
  if (timer) clearInterval(timer);
  timer = null;
  opencode.setEconomia(false);
  log("INFO", "[ECONOMIA] Monitor parado");
}

function estaAtivo() {
  return ativo;
}

module.exports = { iniciar, parar, estaAtivo, checar };