// ===================== TRAVA DE FOCO (nao roubar a tela durante jogo) =====================
//
// O dono pediu: enquanto ele joga, NADA pode trocar o foco da janela.
//
// No Windows, duas coisas DO dono exigem ativar a janela alvo:
//   - SetForegroundWindow / AppActivate
//   - ShowWindow com SW_RESTORE(9) / SW_MAXIMIZE(3)
// Nao existe digitar tecla em janela que nao esteja em primeiro plano. Por isso
// o bot precisa checar ANTES, e recusar a acao, em vez de tentar e falhar.
//
// O sintoma reportado era "o PC troca de aba do nada, eu tava no Valorant e
// veio pra ca". Como nao ha comando do dono no meio, o culpado nao e uma
// acao sob demanda: e qualquer coisa periodica que ative janela. Este modulo
// centraliza a trava para que TODO caminho de foco passe por ele.
//
// Deteccao por `tasklist` e nao por PowerShell/WMI: e o jeito mais barato,
// nao abre janela e nao usa Get-CimInstance (proibido no PC do dono).
// O resultado e cacheado por 2s porque varios pontos de foco podem ser testados
// na mesma acao.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ARQ_CFG = path.join(__dirname, "..", "data", "foco-guard.json");

// Executaveis de jogo. Lista curta e explicita de proposito: detectar "qualquer
// coisa que nao seja o jogo" geraria falso positivo com o navegador e o
// Discord, que ficam abertos junto. Para incluir outro jogo, acrescente o
// executavel aqui ou em data/foco-guard.json.
const JOGOS_PADRAO = [
  "VALORANT-Win64-Shipping.exe",
  "cs2.exe",
  "csgo.exe",
  "GTA5.exe",
  "FiveM.exe",
  "javaw.exe", // Minecraft e mods
  "Java(TM) Platform SE binary.exe",
  "osu!.exe",
  "League of Legends.exe",
  "StarRail.exe",
  "EscapeFromTarkov.exe",
  "hl2.exe",
  "hl.exe",
  "doom.exe",
  "Cyberpunk2077.exe",
  "RDR2.exe",
  "Elden Ring.exe",
];

let cache = { validoAte: 0, jogos: new Set(), ok: true };

function carregarConfig() {
  let jogos = JOGOS_PADRAO;
  let ativo = true;
  try {
    if (fs.existsSync(ARQ_CFG)) {
      const cfg = JSON.parse(fs.readFileSync(ARQ_CFG, "utf8"));
      if (Array.isArray(cfg.jogos) && cfg.jogos.length) jogos = cfg.jogos;
      if (typeof cfg.ativo === "boolean") ativo = cfg.ativo;
    }
  } catch (e) {
    // config corrompida nao pode derrubar a trava: mantem o padrao
  }
  return { jogos, ativo };
}

function normalizar(nome) {
  return String(nome || "").trim().toLowerCase();
}

// Devolve o nome do jogo detectado, ou null.
function detectarJogo() {
  const { jogos, ativo } = carregarConfig();
  if (!ativo) return null;

  const agora = Date.now();
  if (cache.validoAte > agora && cache.ok) {
    return cache.jogo || null;
  }

  let encontrados = new Set();
  let ok = true;
  try {
    const out = execFileSync("tasklist.exe", ["/FO", "CSV", "/NH"], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const alvo of jogos) {
      const a = normalizar(alvo);
      if (out.toLowerCase().includes(`"${a}"`)) encontrados.add(alvo);
    }
  } catch (e) {
    // tasklist falhou. Nao trava o bot: devolve "sem jogo" e marca para
    // nao confiar num cache vazio dentro da janela de validade.
    ok = false;
  }

  const jogo = encontrados.size ? [...encontrados][0] : null;
  cache = { validoAte: agora + 2000, jogo, ok };
  return jogo;
}

// Função que os chamadores usam ANTES de ativar/mostrar uma janela.
function emJogo() {
  return detectarJogo() !== null;
}

/**
 * Use nos pontos que roubam foco.
 * @param {string} acao  nome da acao, so pro log/diagnostico
 * @returns {string|null} motivo do bloqueio, ou null se liberado
 */
function bloquearSeEmJogo(acao) {
  const jogo = detectarJogo();
  if (!jogo) return null;
  const motivo = `⛔ travado: ${jogo} esta rodando (acao "${acao}" mexe no foco)`;
  try {
    fs.appendFileSync(
      path.join(__dirname, "..", "logs", "foco-guard.log"),
      `[${new Date().toISOString().slice(0, 19).replace("T", " ")}] BLOQUEADO ${acao} | jogo=${jogo}\n`,
      "utf8"
    );
  } catch (e) {}
  return motivo;
}

module.exports = { emJogo, detectarJogo, bloquearSeEmJogo, JOGOS_PADRAO };
