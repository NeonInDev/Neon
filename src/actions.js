const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const { log } = require("./logger");
const { executarRoteiro, tocarSpotify, tocarVideoYouTube } = require("./browser");
const { cotacaoMoeda, cotacaoCrypto, clima, buscarCEP, definicao, fatoAleatorio, meuIP, gerarImagem, buscarImagem, imagemAleatoria } = require("./api");
const pc = require("./pc");
const { traduzir } = require("./translate");
const { detectar: detectarCustom, adicionar: addCustom, remover: removeCustom, listar: listarCustom } = require("./custom_commands");
const { criarLembrete } = require("./timers");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function limparFiller(t) {
  return t.replace(/\s+(?:por\s+favor|pfv|please|pls)\s*$/i, "").replace(/^\s*(?:por\s+favor|pfv|please|pls)\s+/i, "").trim();
}

const exec = promisify(execCb);
const TIMEOUT = 5000;
const OWNER_ID = "1442928336329379925";

async function tentar(comando) {
  log("INFO", "[ACTION] tentando comando", { comando });
  try {
    const { stdout, stderr } = await exec(comando, { timeout: TIMEOUT });
    if (stdout) log("INFO", "[ACTION] stdout", { comando, stdout: stdout.trim() });
    if (stderr) log("WARN", "[ACTION] stderr", { comando, stderr: stderr.trim() });
    return { ok: true, stdout: stdout?.trim(), stderr: stderr?.trim() };
  } catch (err) {
    log("WARN", "[ACTION] comando FALHOU", { comando, erro: err.message });
    return { ok: false, stdout: err.stdout?.trim(), stderr: err.stderr?.trim(), erro: err.message };
  }
}

async function abrirUrl(url) {
  if (process.platform === "win32") {
    const r = await tentar(`start "" "${url}"`);
    if (r.ok) return "direto";
    return null;
  }
  if ((await tentar(`termux-open "${url}"`)).ok) return "direto";
  if ((await tentar(`am start --user 0 -a android.intent.action.VIEW -d "${url}"`)).ok) return "direto";
  if ((await tentar(`termux-notification --id neon_abrir --title "Neon" --content "Toque para abrir" --action "${url}" --alert-once --priority high`)).ok) return "notificacao";
  return null;
}

async function abrirComando(comando, label) {
  if ((await tentar(comando)).ok) return "direto";
  if (process.platform !== "win32") {
    if ((await tentar(`termux-notification --id neon_abrir --title "Neon" --content "Toque para abrir ${label}" --action "${comando}" --alert-once --priority high`)).ok) return "notificacao";
  }
  return null;
}

function isWin() {
  return process.platform === "win32";
}

const apps = [
  { nomes: ["spotify"],                     url: "https://open.spotify.com", comando: "start spotify:" },
  { nomes: ["steam", "steam store", "steam powered", "app da steam", "steam powered store", "steam app"],
                                            url: "https://store.steampowered.com", comando: "start steam:" },
  { nomes: ["riot", "riot client", "league", "lol", "league of legends", "valorant", "val", "riot games"],
                                            url: "https://riotgames.com", comando: "start riot" },
  { nomes: ["youtube", "yt", "youtube music"],
                                            url: "https://youtube.com" },
  { nomes: ["chrome", "google chrome", "browser chrome"],
                                            url: "https://google.com" },
  { nomes: ["whatsapp", "zap", "zapzap", "whats"],
                                            url: "https://wa.me" },
  { nomes: ["telegram", "tg"],              url: "https://t.me" },
  { nomes: ["instagram", "insta", "ig"],    url: "https://instagram.com" },
  { nomes: ["twitter", "x"],                url: "https://x.com" },
  { nomes: ["discord", "dc"],               url: "https://discord.com/channels/@me" },
  { nomes: ["gmail", "email", "mail"],      url: "https://mail.google.com" },
  { nomes: ["maps", "mapa", "google maps", "google mapas"],
                                            url: "https://maps.google.com" },
  { nomes: ["camera", "câmera"],            comando: "am start --user 0 -a android.media.action.IMAGE_CAPTURE", so: "android" },
  { nomes: ["config", "configuração", "configuracoes", "ajustes", "settings"],
                                            comando: "am start --user 0 -a android.settings.SETTINGS", so: "android" },
  { nomes: ["explorador", "explorer", "arquivos", "file explorer"],
                                            comando: "start explorer", so: "win32" },
  { nomes: ["bloco de notas", "bloco", "notepad", "notas"],
                                            comando: "start notepad", so: "win32" },
  { nomes: ["cmd", "terminal", "prompt", "command prompt"],
                                            comando: "start cmd", so: "win32" },
  { nomes: ["powershell", "ps", "shell"],   comando: "start powershell", so: "win32" },
  { nomes: ["calculadora", "calc", "calculator"],
                                            comando: "start calc", so: "win32" },
  { nomes: ["painel de controle", "painel", "control", "control panel"],
                                            comando: "start control", so: "win32" },
  { nomes: ["navegador", "browser", "opera gx", "opera", "internet"],
                                            url: "https://google.com" },
  { nomes: ["twitch", "tv"],                url: "https://twitch.tv" },
  { nomes: ["netflix"],                      url: "https://netflix.com" },
  { nomes: ["prime video", "prime", "amazon prime"],
                                            url: "https://primevideo.com" },
  { nomes: ["spotify web", "spotify web player"],
                                            url: "https://open.spotify.com" },
];

const pcCommands = [
  { nomes: ["desligar", "desligar pc"], fn: async () => (await tentar("shutdown /s /t 15")).ok ? "🖥️ Desligando em 15s. Use `neon, cancelar` para cancelar." : null },
  { nomes: ["reiniciar", "reiniciar pc"], fn: async () => (await tentar("shutdown /r /t 15")).ok ? "🖥️ Reiniciando em 15s." : null },
  { nomes: ["cancelar", "cancelar desligamento", "parar"], fn: async () => (await tentar("shutdown /a")).ok ? "✅ Cancelado." : null },
  { nomes: ["suspender", "hibernar"], fn: async () => (await tentar("rundll32.exe powrprof.dll,SetSuspendState 0,1,0")).ok ? "💤 Suspenso." : null },
  { nomes: ["bloquear", "travar", "lock"], fn: async () => (await tentar("rundll32.exe user32.dll,LockWorkStation")).ok ? "🔒 PC bloqueado." : null },
];

function encontrarApp(texto) {
  const lower = texto.toLowerCase().trim();
  const clean = limparFiller(lower);
  const match = clean.match(/^(?:abrir|abra|abre|open)\s+(.+)/i);
  if (!match) return null;

  const nomeBuscado = match[1].trim().toLowerCase();
  const candidato = apps.find((app) => {
    if (app.so && app.so !== process.platform && !(app.so === "android" && !isWin())) return false;
    if (app.so === "android" && isWin()) return false;
    if (app.so === "win32" && !isWin()) return false;
    return app.nomes.some((n) => nomeBuscado.includes(n));
  });
  return candidato || { nomes: [nomeBuscado], url: `https://${nomeBuscado}.com` };
}

function encontrarPcCommand(texto) {
  const lower = texto.toLowerCase().trim();
  return pcCommands.find((c) => c.nomes.some((n) => lower.includes(n)));
}

function encontrarExec(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  const match = lower.match(/^(?:executa|executar|roda|run)\s+(.+)/i);
  if (!match) return null;
  return match[1].trim();
}

function encontrarSpotify(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  const match = lower.match(/^(?:toca|tocar|play|toca música|toca a música)\s+(.+)/i);
  if (!match) return null;
  const query = match[1].trim();
  // Se mencionou youtube explicitamente, não é spotify
  if (/\bno\s+youtube\b|\bno\s+yt\b/i.test(query)) return null;
  return query;
}

function encontrarYouTube(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  // "coloca X", "coloca X no youtube", "toca X no youtube", "assiste X", "assiste X no youtube"
  const match = lower.match(/^(?:coloca|colocar|toca|tocar|assiste|assistir|play|da play|dá play)\s+(?:o\s+)?(?:(?:vídeo|video)\s+)?(.+)/i);
  if (!match) return null;
  return match[1].trim().replace(/\bno\s+youtube\b|\bno\s+yt\b/gi, "").trim();
}

function encontrarPesquisa(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  const match = lower.match(/^(?:pesquisa|pesquisar|busca|buscar|procura|procurar|search)\s+(.+)/i);
  if (!match) return null;
  return match[1].trim();
}

function encontrarDigitar(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  const match = lower.match(/^(?:digita|digitar|type|escreve|escrever)\s+(.+)/i);
  if (!match) return null;
  return match[1].trim();
}

const steamGames = {
  "counter strike": 730, "cs": 730, "csgo": 730, "cs2": 730, "counter-strike": 730,
  "dota 2": 570, "dota": 570,
  "team fortress 2": 440, "tf2": 440,
  "grand theft auto v": 271590, "gta v": 271590, "gta5": 271590, "gtav": 271590,
  "among us": 945360,
  "elden ring": 1245620,
  "cyberpunk 2077": 1091500,
  "red dead redemption 2": 1174180, "rdr2": 1174180,
  "balatro": 2379780,
  "stardew valley": 413150,
  "the witcher 3": 292030, "witcher 3": 292030,
  "left 4 dead 2": 550, "l4d2": 550,
  "half-life": 70, "halflife": 70,
  "portal 2": 620,
  "terraria": 105600,
  "astroneer": 361420,
  "hollow knight": 367520, "hollow": 367520,
  "hollow knight silksong": 1030300, "silksong": 1030300,
  "marvel rivals": 2767030,
  "minecraft": null,
};

function encontrarJogo(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  const match = lower.match(/^(?:jogar|joga|abrir|abre|abrir jogo|abre jogo|play)\s+(.+)/i);
  if (!match) return null;
  const nome = match[1].trim().toLowerCase();
  const id = steamGames[nome];
  if (id !== undefined) return { nome: match[1].trim(), id };
  // fallback: busca por substring no dicionário
  for (const [key, val] of Object.entries(steamGames)) {
    if (nome.includes(key) || key.includes(nome)) return { nome: key, id: val };
  }
  return { nome: match[1].trim(), id: null };
}

function encontrarNavegar(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  const match = lower.match(/^(?:vai pra|vá pra|navega|navegar|ir para|go to)\s+(.+)/i);
  if (!match) return null;
  let url = match[1].trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url;
}

function encontrarCotacao(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/(?:cotação|cotacao|quanto\s+ta|preço|preco|valor).*(?:dolar|dólar|euro|libra|peso|bitcoin|btc|ethereum|eth|solana|crypto|moeda)/i.test(lower)) return true;
  if (/^(?:dolar|dólar|euro|libra|peso)\s+(?:hoje|agora|valor|preco|preço|cotacao|cotação)/i.test(lower)) return true;
  if (/^(?:bitcoin|btc|ethereum|eth|solana)\s+(?:hoje|agora|valor|preco|preço)/i.test(lower)) return true;
  return false;
}

function encontrarStatusDiscord(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  const m = lower.match(/(?:muda|mudar|troca|trocar|alterar|coloca|colocar|define|definir|set)\s+(?:meu\s+)?(?:status\s+)?(?:do\s+)?(?:discord\s+)?(?:pra|para|como|em)?\s*(.+)/i);
  if (!m) return null;
  const alvo = m[1].trim().toLowerCase();
  const statusMap = {
    online: "online", on: "online", verde: "online", disponivel: "online",
    idle: "idle", ausente: "idle", longe: "idle", amarelo: "idle",
    dnd: "dnd", ocupado: "dnd", "nao perturbe": "dnd", "não perturbe": "dnd", vermelho: "dnd",
    invisible: "invisible", invisivel: "invisible", "invisível": "invisible", off: "invisible", offline: "invisible",
  };
  if (statusMap[alvo]) return { acao: "status", valor: statusMap[alvo] };
  // Se tiver texto livre, é custom status
  return { acao: "custom", valor: alvo };
}

function encontrarClima(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/(?:tempo|clima|previsão|previsao|temperatura)\s+(?:em\s+|de\s+|do\s+|da\s+|para\s+)?(.+)/i.test(lower)) return true;
  if (/^(?:como\s+)?(?:esta|tá|ta|está)\s+(?:o\s+)?(?:tempo|clima)\s+(?:em\s+)?(.+)/i.test(lower)) return true;
  return false;
}

function encontrarCEP(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^cep\s+\d{5}-?\d{3}/i.test(lower)) return true;
  if (/\b\d{5}-?\d{3}\b/.test(lower) && /(?:cep|busca|buscar|consulta|consultar)/i.test(lower)) return true;
  return false;
}

function encontrarDefinicao(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:o que|oque|que|qual)\s+(?:é|e|significa)\s+(.+)$/i.test(lower) && lower.split(/\s+/).length <= 8) return true;
  if(/^(?:definição|definicao|significado)\s+(?:de\s+)?(.+)$/i.test(lower) && lower.split(/\s+/).length <= 6) return true;
  return false;
}

function encontrarFato(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:fato|curiosidade|conta|conta algo|me diga algo|conhecimento)[\s.!?]*$/i.test(lower)) return true;
  return false;
}

function encontrarIP(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/(?:meu\s+)?(?:ip|endereço\s*ip|endereco\s*ip)/i.test(lower)) return true;
  return false;
}

function encontrarGerarImagem(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:gera|gerar|cria|criar|desenha|faça|faz|produz)\s+(?:uma\s+|um\s+)?(?:imagem|foto|arte|arte\s+visual)\s+(?:de|do|da|com|pra|para)?\s+(.+)/i.test(lower)) return true;
  return false;
}

function encontrarMostrarImagem(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:mostra|mostrar|me\s+manda|exibe|exibir|quero\s+ver|acha|busca)\s+(?:uma?\s+|um\s+)?(?:foto|imagem|gif|figura)\s+(?:de|do|da|do|pra|para)?\s+(.+)/i.test(lower)) return true;
  if (/^(?:mostra|mostrar|me\s+manda|exibe|exibir|quero\s+ver)\s+(?:um\s+|um\s+)?(?:gato|cachorro|dog|cat|paisagem|natureza)\s*/i.test(lower)) return true;
  return false;
}

function encontrarVolume(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/volume\s+(?:maximo|max|maximo|minimo|min|0)/i.test(lower)) return true;
  if (/^(?:aumenta|diminui|aumentar|diminuir|sobe|desce|subir|descer)\s+(?:o\s+)?volume/i.test(lower)) return true;
  if (/^(?:muta|mutar|desmuta|desmutar|silencia|silenciar)\s*(?:o\s+)?(?:audio|som|volume|pc)?/i.test(lower)) return true;
  if (/^volume\s+\d+/i.test(lower)) return true;
  return false;
}

function encontrarScreenshot(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:tira|tirar|faz|fazer|captura|capturar)\s+(?:um\s+)?(?:print|screenshot|captura|foto|fotografia)\s*(?:da\s+tela|do\s+pc|do\s+monitor|da\s+area\s+de\s+trabalho)?/i.test(lower)) return true;
  if (/^(?:printa|printar|screenshotar)\s/i.test(lower)) return true;
  return false;
}

function encontrarPCInfo(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:como\s+)?(?:ta|tá|esta|está)\s+(?:o\s+)?pc|status\s+(?:do\s+)?pc|info\s+(?:do\s+)?pc|monitorar|desempenho/i.test(lower)) return true;
  if (/como\s+ta\s+o\s+(?:pc|computador|desempenho|sistema)/i.test(lower)) return true;
  return false;
}

function encontrarClipboard(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:copia|copiar|cola|colar)\s*(?:isso|isto|texto|clipboard|area\s*de\s*transferencia|pra\s+area)?/i.test(lower)) return true;
  if (/(?:copia|copiar)\s+(?:pra|para)\s+(?:area|a\s*area)\s+(?:de\s+)?transferencia/i.test(lower)) return true;
  return false;
}

function encontrarTTS(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:fala|falar|diz|dizer|pronuncia|pronunciar)\s+(?:algo|isso|isto|em\s+voz\s+alta|em\s+audio|pelas\s+caixas)/i.test(lower)) return true;
  if (/^(?:leia|le|ler)\s+(?:em\s+voz\s+alta|pra\s+mim|para\s+mim|esse\s+texto)/i.test(lower)) return true;
  return false;
}

function encontrarTraducao(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:traduz|traduzir|traducao|tradução|translate)\s+(.+?)(?:\s+(?:pra|para|em)\s+(.+))?/i.test(lower)) return true;
  return false;
}

function encontrarLembrete(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:me\s+)?(?:lembra|lembrar|lembrete|alarme|alerta|timer|despertador|lembre)\s+(?:de|pra|para|em)/i.test(lower)) return true;
  return false;
}

function encontrarCustomCommand(texto) {
  const cmd = detectarCustom(texto);
  return !!cmd;
}

function encontrarBrowser(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  const m = lower.match(/^(?:entra|entrar|vai|vá|ir|abre|abrir|navega|navegar)(?:\s+(?:no|na|em|para))?\s+\S+/i);
  if (!m) return null;
  return true;
}

function encontrarArquivo(texto) {
  const lower = texto.toLowerCase().trim();
  let match;

  match = lower.match(/^(?:criar arquivo|create file|salvar arquivo)\s+(.+)/i);
  if (match) return { acao: "criar", args: match[1].trim() };

  match = lower.match(/^(?:ler arquivo|read file|cat|abrir arquivo)\s+(.+)/i);
  if (match) return { acao: "ler", args: match[1].trim() };

  match = lower.match(/^(?:deletar arquivo|delete file|rm|apagar arquivo|excluir arquivo)\s+(.+)/i);
  if (match) return { acao: "deletar", args: match[1].trim() };

  match = lower.match(/^(?:listar|ls|dir)\s+(.+)/i);
  if (match) return { acao: "listar", args: match[1].trim() };

  match = lower.match(/^(?:mover|move|renomear|renomeia)\s+(.+?)(?:\s+(?:para|pra)\s+)(.+)/i);
  if (match) return { acao: "mover", args: { origem: match[1].trim(), destino: match[2].trim() } };

  match = lower.match(/^(?:copiar|copy|copia)\s+(.+?)(?:\s+(?:para|pra)\s+)(.+)/i);
  if (match) return { acao: "copiar", args: { origem: match[1].trim(), destino: match[2].trim() } };

  match = lower.match(/^(?:editar|edit|alterar|mudar)\s+(.+?)(?:\s+(?:linha|line)\s+)(\d+)(?:\s+(?:para|pra|:|,)\s+)?(.+)/i);
  if (match) return { acao: "editar", args: { arquivo: match[1].trim(), linha: parseInt(match[2]), texto: match[3].trim() } };

  match = lower.match(/^(?:baixar|download|download file)\s+(.+?)(?:\s+(?:para|pra|em)\s+)(.+)/i);
  if (match) return { acao: "baixar", args: { url: match[1].trim(), destino: match[2].trim() } };

  match = lower.match(/^(?:escrever|write|append|adicionar)\s+(?:em\s+|no\s+|na\s+)?(.+?)(?:\s+(?:o texto|o conteudo|o conteúdo|:|,)\s+)(.+)/i);
  if (match) return { acao: "escrever", args: { arquivo: match[1].trim(), conteudo: match[2].trim() } };

  return null;
}

function encontrarMensagem(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());

  // Pattern 1: "envia msg pra <alvo>: <conteudo>" ou "manda dm pra <alvo> dizendo <conteudo>"
  let match = lower.match(/^(?:enviar|envia|manda|mandar)\s+(?:mensagem|msg|dm\s*)?(?:pra|para)?\s*(.+?)(?::\s*|,\s*|\s+dizendo\s+)(.+)/i);
  if (match) return { alvo: match[1].trim(), conteudo: match[2].trim() };

  // Pattern 2: "envia msg pra <alvo> <conteudo>" (sem separator)
  match = lower.match(/^(?:enviar|envia|manda|mandar)\s+(?:mensagem|msg|dm\s*)?(?:pra|para)?\s*(.+)/i);
  if (match) {
    const resto = match[1].trim();
    const primeiroEspaco = resto.indexOf(" ");
    if (primeiroEspaco > 0) {
      const alvo = resto.slice(0, primeiroEspaco).trim();
      const conteudo = resto.slice(primeiroEspaco).trim();
      if (alvo && conteudo) return { alvo, conteudo };
    }
  }

  return null;
}

function permitido(userId) {
  return userId === OWNER_ID;
}

function detectarCategoria(texto) {
  // Custom commands (usuário define) — maior prioridade
  if (encontrarCustomCommand(texto)) return "customCommand";
  if (isWin()) {
    const jogo = encontrarJogo(texto);
    if (jogo && jogo.id !== undefined) return "jogo";
  }
  if (encontrarApp(texto)) return "app";
  if (encontrarScreenshot(texto)) return "screenshot";
  if (isWin() && encontrarPcCommand(texto)) return "pcCommand";
  if (isWin() && encontrarExec(texto)) return "exec";
  if (encontrarArquivo(texto)) return "arquivo";
  if (encontrarMensagem(texto)) return "mensagem";
  if (encontrarSpotify(texto)) return "spotify";
  if (encontrarYouTube(texto)) return "youtube";
  if (encontrarPesquisa(texto)) return "pesquisa";
  if (encontrarDigitar(texto)) return "digitar";
  if (isWin() && encontrarJogo(texto)) return "jogo";
  if (encontrarVolume(texto)) return "volume";
  if (encontrarPCInfo(texto)) return "pcInfo";
  if (encontrarClipboard(texto)) return "clipboard";
  if (encontrarTTS(texto)) return "tts";
  if (encontrarTraducao(texto)) return "traducao";
  if (encontrarLembrete(texto)) return "lembrete";
  if (encontrarBrowser(texto)) return "browser";
  if (encontrarNavegar(texto)) return "navegar";
  if (encontrarCotacao(texto)) return "cotacao";
  if (encontrarClima(texto)) return "clima";
  if (encontrarCEP(texto)) return "cep";
  if (encontrarDefinicao(texto)) return "definicao";
  if (encontrarFato(texto)) return "fato";
  if (encontrarIP(texto)) return "ip";
  if (encontrarGerarImagem(texto)) return "gerarImagem";
  if (encontrarMostrarImagem(texto)) return "mostrarImagem";
  if (/status.*discord|discord.*status/i.test(texto)) return "statusDiscord";
  // Detecta nome de app sem "abrir" (ex: "steam", "valorant")
  if (isWin() && encontrarApp("abrir " + texto)) return "app";
  return null;
}

async function executarAcao(texto, usuarioMestre = false, userId = null, message = null) {
  const podePC = permitido(userId);
  // Remove prefixo "Neon," "Neon." "Neon " (vindo de DM sem strip)
  texto = texto.replace(/^[Nn][Ee][Oo][Nn][,\s\.]\s*/, "");
  const lower = texto.toLowerCase().trim();

  // ─── Daddy is home ───
  if (lower === "daddy is home" || lower === "daddy's home") {
    if (!podePC) return "hmm, acho que nao. voce nao e o chefao aqui.";
    const erros = [];
    const r1 = await tentar('start spotify:');
    if (!r1.ok) erros.push("Spotify");
    const r2 = await tentar('start steam:');
    if (!r2.ok) erros.push("Steam");
    const now = new Date();
    const hora = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    let climaStr = "";
    try {
      const c = await clima("São Paulo");
      climaStr = `${c.condicao}, ${c.temperatura}`;
    } catch {}
    let fato = "";
    try {
      const f = await fatoAleatorio();
      fato = f.fato;
    } catch {}
    return [
      "```",
      "╔══════════════════════════════════╗",
      "║       BEM-VINDO EM CASA          ║",
      "╚══════════════════════════════════╝",
      "",
      `🕐 ${hora}`,
      climaStr ? `🌡 ${climaStr}` : "",
      fato ? `\n💡 ${fato}` : "",
      "",
      ">> Spotify:   " + (r1.ok ? "✅" : "❌"),
      ">> Steam:     " + (r2.ok ? "✅" : "❌"),
      "```",
    ].filter(Boolean).join("\n");
  }

  const categoria = detectarCategoria(texto);

  if (categoria && !podePC) {
    return "❌ Acesso negado. Você não é o dono do PC.";
  }

  // Apps
  if (categoria === "app") {
    const app = encontrarApp(texto);
    const label = app.nomes[0];
    log("INFO", "[ACTION] app detectado", { label, texto, url: app.url, comando: app.comando });

    // Tenta abrir o app desktop primeiro (start <nome>)
    const desktopCmd = `start ${label}`;
    let desktop = await tentar(desktopCmd);
    if (desktop.ok) return `✅ Abrindo ${label}.`;

    // Tenta comando personalizado (URI scheme)
    if (app.comando) {
      let via = await abrirComando(app.comando, label);
      if (via === "direto") return `✅ Abrindo ${label}.`;
      if (via === "notificacao") return `📲 Toque na notificação para abrir ${label}.`;
    }

    // Fallback: URL no navegador
    if (app.url) {
      let via = await abrirUrl(app.url);
      if (via === "direto") return `✅ Abrindo ${label} (navegador).`;
      if (via === "notificacao") return `📲 Toque na notificação para abrir ${label}.`;
      return `❌ Não consegui abrir ${label}.`;
    }

    return `❌ Não consegui abrir ${label}.`;
  }

  // PC commands (desligar, etc.)
  if (categoria === "pcCommand") {
    const pcCmd = encontrarPcCommand(texto);
    log("INFO", "[ACTION] comando PC detectado", { label: pcCmd.nomes[0], texto });
    const result = await pcCmd.fn();
    if (result) return result;
  }

  // Executar comando arbitrário
  if (categoria === "exec") {
    const cmd = encontrarExec(texto);
    log("INFO", "[ACTION] executando comando", { cmd });
    const r = await tentar(cmd);
    if (r.ok) {
      let saida = r.stdout || "(sem saída)";
      if (saida.length > 1900) saida = saida.slice(0, 1900) + "\n... (truncado)";
      return `✅ \`${cmd}\`\n\`\`\`\n${saida}\n\`\`\``;
    }
    return `❌ \`${cmd}\`\n\`\`\`\n${r.stderr || r.erro}\n\`\`\``;
  }

  // Manipular arquivos
  if (categoria === "arquivo") {
    const arq = encontrarArquivo(texto);

    // Ações que recebem args como string (criar, ler, deletar, listar)
    if (typeof arq.args === "string") {
      const caminho = path.resolve(arq.args.split(/\s+/)[0]);
      const conteudo = arq.args.slice(arq.args.split(/\s+/)[0].length).trim();

      switch (arq.acao) {
        case "criar": {
          const dir = path.dirname(caminho);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(caminho, conteudo || "", "utf8");
          return `✅ Arquivo criado: \`${caminho}\``;
        }
        case "ler": {
          if (!fs.existsSync(caminho)) return `❌ Arquivo não encontrado: \`${caminho}\``;
          const data = fs.readFileSync(caminho, "utf8");
          const limite = data.length > 1900 ? data.slice(0, 1900) + "\n... (truncado)" : data;
          return `📄 \`${caminho}\`\n\`\`\`\n${limite}\n\`\`\``;
        }
        case "deletar": {
          if (!fs.existsSync(caminho)) return `❌ Arquivo não encontrado: \`${caminho}\``;
          fs.unlinkSync(caminho);
          return `🗑️ Deletado: \`${caminho}\``;
        }
        case "listar": {
          const alvo = caminho || ".";
          if (!fs.existsSync(alvo)) return `❌ Diretório não encontrado: \`${alvo}\``;
          const itens = fs.readdirSync(alvo);
          if (itens.length === 0) return `📁 \`${alvo}\` — vazio`;
          let lista = itens.slice(0, 30).join("\n");
          if (itens.length > 30) lista += `\n... (mais ${itens.length - 30} itens)`;
          return `📁 \`${alvo}\`\n\`\`\`\n${lista}\n\`\`\``;
        }
      }
    }

    // Ações que recebem args como objeto { origem, destino, arquivo, url, ... }
    switch (arq.acao) {
      case "mover": {
        const origem = path.resolve(arq.args.origem);
        const destino = path.resolve(arq.args.destino);
        if (!fs.existsSync(origem)) return `❌ Arquivo não encontrado: \`${origem}\``;
        const dir = path.dirname(destino);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.renameSync(origem, destino);
        return `✅ Movido: \`${origem}\` → \`${destino}\``;
      }
      case "copiar": {
        const origem = path.resolve(arq.args.origem);
        const destino = path.resolve(arq.args.destino);
        if (!fs.existsSync(origem)) return `❌ Arquivo não encontrado: \`${origem}\``;
        const dir = path.dirname(destino);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.cpSync(origem, destino, { recursive: true });
        return `✅ Copiado: \`${origem}\` → \`${destino}\``;
      }
      case "editar": {
        const caminho = path.resolve(arq.args.arquivo);
        if (!fs.existsSync(caminho)) return `❌ Arquivo não encontrado: \`${caminho}\``;
        const linhas = fs.readFileSync(caminho, "utf8").split("\n");
        const idx = arq.args.linha - 1;
        if (idx < 0 || idx >= linhas.length) return `❌ Linha ${arq.args.linha} não existe (o arquivo tem ${linhas.length} linhas).`;
        linhas[idx] = arq.args.texto;
        fs.writeFileSync(caminho, linhas.join("\n"), "utf8");
        return `✅ Linha ${arq.args.linha} alterada em \`${caminho}\``;
      }
      case "baixar": {
        try {
          const resp = await require("axios").get(arq.args.url, { responseType: "stream", timeout: 30000 });
          const destino = path.resolve(arq.args.destino);
          const dir = path.dirname(destino);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const writer = fs.createWriteStream(destino);
          resp.data.pipe(writer);
          await new Promise((resolve, reject) => { writer.on("finish", resolve); writer.on("error", reject); });
          return `✅ Baixado: \`${arq.args.url}\` → \`${destino}\``;
        } catch (err) {
          return `❌ Erro ao baixar: ${err.message}`;
        }
      }
      case "escrever": {
        const caminho = path.resolve(arq.args.arquivo);
        const dir = path.dirname(caminho);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(caminho, arq.args.conteudo + "\n", "utf8");
        return `✅ Conteúdo adicionado a \`${caminho}\``;
      }
    }
  }

  // Enviar mensagem no Discord
  if (categoria === "mensagem") {
    const { client: dc } = require("./client");
    const info = encontrarMensagem(texto);
    const alvo = info.alvo.toLowerCase();

    let usuarioDiscord = null;

    // "mim"/"me"/"eu" → dono
    if (/^(?:mim|me|eu|dono|owner)$/i.test(alvo)) {
      try {
        usuarioDiscord = await dc.users.fetch(OWNER_ID);
      } catch {}
      if (usuarioDiscord) {
        try {
          await usuarioDiscord.send(`💬 **Neon:** ${info.conteudo}`);
          return `✅ Mensagem enviada para **${usuarioDiscord.username}**.`;
        } catch (err) {
          return `❌ Não consegui enviar DM pra você: ${err.message}`;
        }
      }
    }

    // 1. Tenta buscar por ID diretamente
    if (/^\d{17,19}$/.test(alvo)) {
      try {
        usuarioDiscord = await dc.users.fetch(alvo);
      } catch {}
    }

    // 2. Procura no cache + fetch por username
    if (!usuarioDiscord) {
      for (const guild of dc.guilds.cache.values()) {
        // Cache primeiro
        let encontrado = guild.members.cache.find(m =>
          m.user.username.toLowerCase() === alvo ||
          (m.nickname && m.nickname.toLowerCase() === alvo) ||
          (m.user.globalName && m.user.globalName.toLowerCase() === alvo)
        );
        if (encontrado) { usuarioDiscord = encontrado.user; break; }
        // Se não achou no cache, tenta fetch da guild
        try {
          const membros = await guild.members.fetch();
          encontrado = membros.find(m =>
            m.user.username.toLowerCase() === alvo ||
            (m.nickname && m.nickname.toLowerCase() === alvo) ||
            (m.user.globalName && m.user.globalName.toLowerCase() === alvo)
          );
          if (encontrado) { usuarioDiscord = encontrado.user; break; }
        } catch {
          continue;
        }
      }
    }

    if (!usuarioDiscord) return `❌ Não encontrei ninguém chamado "${info.alvo}".`;
    try {
      await usuarioDiscord.send(`💬 **Neon:** ${info.conteudo}`);
      return `✅ Mensagem enviada para **${usuarioDiscord.username}**.`;
    } catch (err) {
      return `❌ Não consegui enviar DM para ${info.alvo}: ${err.message}`;
    }
  }

  // YouTube — pesquisar e tocar vídeo
  if (categoria === "youtube") {
    let video = encontrarYouTube(texto);
    const lowerTexto = texto.toLowerCase();
    const skip = /\b(outro|outra|outros|outras|another|diferente|next)\b/i.test(lowerTexto) ? 1 : 0;
    if (skip) video = video.replace(/\b(outro|outra|outros|outras|another|diferente|next)\s+(?:vídeo|video\s+)?/i, "").trim();
    try {
      const msg = await tocarVideoYouTube(video, skip);
      return msg;
    } catch (err) {
      return `❌ Não consegui tocar no YouTube: ${err.message}`;
    }
  }

  // Spotify — busca ID via Web, toca no Desktop
  if (categoria === "spotify") {
    const musica = encontrarSpotify(texto);
    try {
      const msg = await tocarSpotify(musica);
      return msg;
    } catch (err) {
      if (err.message?.includes("Track ID")) {
        return `🔍 Não achei "${musica}" no Spotify. Pode ser que precise logar no Spotify Web pelo Opera da Neon (abre uma vez e faz login que fica salvo).`;
      }
      return `❌ Erro no Spotify: ${err.message}`;
    }
  }

  // Pesquisa no navegador
  if (categoria === "pesquisa") {
    const query = encontrarPesquisa(texto);
    const r = await abrirUrl(`https://google.com/search?q=${encodeURIComponent(query)}`);
    if (r) return `🔍 Pesquisando "${query}" no Google.`;
    return `❌ Não consegui pesquisar.`;
  }

  // Digitar texto (via PowerShell SendKeys)
  if (categoria === "digitar") {
    const textoDigitar = encontrarDigitar(texto);
    const psCmd = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${textoDigitar.replace(/'/g, "''")}')"`;
    const r = await tentar(psCmd);
    if (r.ok) return `⌨️ Digitei "${textoDigitar}".`;
    return `❌ Não consegui digitar.`;
  }

  // Steam — jogar
  if (categoria === "jogo") {
    const jogo = encontrarJogo(texto);
    if (!jogo) return null;
    if (jogo.id === undefined || jogo.id === null) return null;
    const r1 = await tentar(`start steam://rungameid/${jogo.id}`);
    if (!r1.ok) return `❌ Não consegui abrir ${jogo.nome}.`;
    await tentar(`powershell -Command "Start-Sleep 2; try { $wshell = New-Object -ComObject wscript.shell; $wshell.AppActivate('Steam'); Start-Sleep 500; [System.Windows.Forms.SendKeys]::SendWait('%{Space}n') } catch {}"`);
    return `🎮 Iniciando ${jogo.nome} pela Steam.`;
  }

  // Navegador com Puppeteer (entra no site e faz ação)
  if (categoria === "browser") {
    const result = await executarRoteiro(texto);
    if (result) return result.msg;
  }

  // Navegar pra URL
  if (categoria === "navegar") {
    const url = encontrarNavegar(texto);
    const r = await abrirUrl(url);
    if (r) return `🌐 Abrindo ${url} no navegador.`;
    return `❌ Não consegui abrir ${url}.`;
  }

  // Cotação de moedas e crypto
  if (categoria === "cotacao") {
    try {
      const [moedas, crypto] = await Promise.all([cotacaoMoeda(), cotacaoCrypto()]);
      const msg = [
        "💰 **Cotações em tempo real:**\n",
        `🇺🇸 Dólar: **R$ ${moedas.dolar.compra.toFixed(2)}** (${moedas.dolar.variacao >= 0 ? "+" : ""}${moedas.dolar.variacao}%)`,
        `🇪🇺 Euro: **R$ ${moedas.euro.compra.toFixed(2)}** (${moedas.euro.variacao >= 0 ? "+" : ""}${moedas.euro.variacao}%)`,
        `🇬🇧 Libra: **R$ ${moedas.libra.compra.toFixed(2)}** (${moedas.libra.variacao >= 0 ? "+" : ""}${moedas.libra.variacao}%)`,
        `🇦🇷 Peso Argentino: **R$ ${moedas.peso.compra.toFixed(4)}**`,
        "",
        "₿ **Crypto:**",
        `Bitcoin: **$${crypto.bitcoin.usd.toLocaleString()}** (${crypto.bitcoin.variacao24h >= 0 ? "+" : ""}${crypto.bitcoin.variacao24h?.toFixed(2) || "0"}% 24h)`,
        `Ethereum: **$${crypto.ethereum.usd.toLocaleString()}** (${crypto.ethereum.variacao24h >= 0 ? "+" : ""}${crypto.ethereum.variacao24h?.toFixed(2) || "0"}% 24h)`,
        `Solana: **$${crypto.solana.usd.toLocaleString()}** (${crypto.solana.variacao24h >= 0 ? "+" : ""}${crypto.solana.variacao24h?.toFixed(2) || "0"}% 24h)`,
      ].join("\n");
      return msg;
    } catch (err) {
      return `❌ Erro ao buscar cotações: ${err.message}`;
    }
  }

  // Clima
  if (categoria === "clima") {
    try {
      const lower = limparFiller(texto.toLowerCase().trim());
      const m = lower.match(/(?:tempo|clima|previsão|previsao|temperatura)\s+(?:em\s+|de\s+|do\s+|da\s+|para\s+)?(.+)$/i)
              || lower.match(/(?:esta|tá|ta|está)\s+(?:o\s+)?(?:tempo|clima)\s+(?:em\s+)?(.+)$/i);
      const cidade = m ? m[1].trim() : "São Paulo";
      const c = await clima(cidade);
      return `🌤 **${cidade}** — ${c.condicao}, ${c.temperatura}, umidade ${c.umidade}, vento ${c.vento}`;
    } catch (err) {
      return `❌ Não consegui buscar o clima: ${err.message}`;
    }
  }

  // CEP
  if (categoria === "cep") {
    try {
      const lower = texto.toLowerCase().trim();
      const m = lower.match(/\b(\d{5}-?\d{3})\b/);
      if (!m) return "❌ CEP inválido.";
      const cep = m[1].replace("-", "");
      const info = await buscarCEP(cep);
      return `📍 **CEP ${info.cep}** — ${info.logradouro}, ${info.bairro}, ${info.cidade}/${info.estado}`;
    } catch (err) {
      return `❌ CEP não encontrado: ${err.message}`;
    }
  }

  // Definição
  if (categoria === "definicao") {
    try {
      const lower = limparFiller(texto.toLowerCase().trim());
      const m = lower.match(/(?:o que|oque|que|qual)\s+(?:é|e|significa)\s+(.+)$/i) || lower.match(/^(?:definição|definicao|significado)\s+(?:de\s+)?(.+)$/i);
      if (!m) return "❌ Não entendi qual palavra procurar.";
      const palavra = m[1].trim();
      const d = await definicao(palavra);
      const defs = d.definicoes.slice(0, 3).map((def, i) =>
        `${i + 1}. _(${def.classe})_ ${def.definicao}${def.exemplo ? `\n   > "${def.exemplo}"` : ""}`
      ).join("\n");
      return `📖 **${d.palavra}**${d.fonetica ? ` (${d.fonetica})` : ""}\n${defs || "Nenhuma definição encontrada."}`;
    } catch (err) {
      // Se a API de dicionário falhar, deixa o AI responder
      return null;
    }
  }

  // Fato aleatório
  if (categoria === "fato") {
    try {
      const f = await fatoAleatorio();
      return `💡 **Sabia que...** ${f.fato}`;
    } catch (err) {
      return `❌ Não consegui buscar um fato agora: ${err.message}`;
    }
  }

  // Meu IP
  if (categoria === "ip") {
    try {
      const info = await meuIP();
      return `🌐 **Seu IP público:** ${info.ip}\n📍 ${info.cidade}, ${info.pais}\n🏢 ${info.provedor}`;
    } catch (err) {
      return `❌ Não consegui descobrir seu IP: ${err.message}`;
    }
  }

  // Gerar imagem via IA
  if (categoria === "gerarImagem") {
    try {
      const lower = limparFiller(texto.toLowerCase().trim());
      const m = lower.match(/^(?:gera|gerar|cria|criar|desenha|faça|faz|produz)\s+(?:uma\s+|um\s+)?(?:imagem|foto|arte|arte\s+visual)\s+(?:de|do|da|com|pra|para)?\s+(.+)/i);
      const prompt = m ? m[1].trim() : texto;
      const url = await gerarImagem(prompt);
      return `🎨 Gerando: "${prompt}"\n${url}`;
    } catch (err) {
      return `❌ Erro ao gerar imagem: ${err.message}`;
    }
  }

  // Mostrar/buscar imagem
  if (categoria === "mostrarImagem") {
    try {
      const lower = limparFiller(texto.toLowerCase().trim());
      // Verifica se é um dos tipos aleatorios conhecidos
      const tipoMatch = lower.match(/^(?:mostra|mostrar|me\s+manda|exibe|exibir|quero\s+ver)\s+(?:um\s+|um\s+)?(gato|cachorro|dog|cat|paisagem|natureza)\s*/i);
      if (tipoMatch) {
        const tipo = { gato: "gato", cachorro: "cachorro", dog: "cachorro", cat: "gato", paisagem: "paisagem", natureza: "paisagem" }[tipoMatch[1].toLowerCase()];
        const url = await imagemAleatoria(tipo);
        return `🐱 Aqui vai uma foto de ${tipo}:\n${url}`;
      }
      const m = lower.match(/^(?:mostra|mostrar|me\s+manda|exibe|exibir|quero\s+ver|acha|busca)\s+(?:uma?\s+|um\s+)?(?:foto|imagem|gif|figura)\s+(?:de|do|da|do|pra|para)?\s+(.+)/i);
      const query = m ? m[1].trim() : texto;
      const url = await buscarImagem(query);
      return `🔍 Aqui está uma imagem de "${query}":\n${url}`;
    } catch (err) {
      return `❌ Erro ao buscar imagem: ${err.message}`;
    }
  }

  // Custom commands (usuário)
  if (categoria === "customCommand") {
    const cmd = detectarCustom(texto);
    if (!cmd) return null;
    if (cmd.action === "responder") return cmd.response;
    if (cmd.action === "executar") {
      const r = await tentar(cmd.value);
      return cmd.response || (r.ok ? `✅ Comando executado.` : `❌ Falha ao executar.`);
    }
    return cmd.response || `✅ Comando personalizado: ${cmd.patterns[0]}`;
  }

  // Volume do sistema
  if (categoria === "volume") {
    try {
      const lower = limparFiller(texto.toLowerCase().trim());
      if (/^(?:muta|mutar|desmuta|desmutar|silencia|silenciar)/i.test(lower)) return await pc.volume("mute");
      if (/(?:maximo|max|maximo|100)/i.test(lower)) return await pc.volume("set", 100);
      if (/(?:minimo|min|0)/i.test(lower)) return await pc.volume("set", 0);
      if (/^(?:aumenta|aumentar|sobe|subir)/i.test(lower)) {
        const m = lower.match(/(\d+)/);
        return await pc.volume("up", m?.[1] || "10");
      }
      if (/^(?:diminui|diminuir|desce|descer)/i.test(lower)) {
        const m = lower.match(/(\d+)/);
        return await pc.volume("down", m?.[1] || "10");
      }
      const volM = lower.match(/^volume\s+(\d+)/i);
      if (volM) return await pc.volume("set", volM[1]);
      return await pc.volume("mute");
    } catch (err) {
      return `❌ Erro no volume: ${err.message}`;
    }
  }

  // Screenshot
  if (categoria === "screenshot") {
    try {
      const path = await pc.screenshot();
      return `📸 Print tirado!\n__FILE__:${path}`;
    } catch (err) {
      return `❌ Erro ao tirar print: ${err.message}`;
    }
  }

  // Informação do PC
  if (categoria === "pcInfo") {
    try {
      const info = await pc.pcInfo();
      return `🖥️ **Status do PC:**\n${info}`;
    } catch (err) {
      return `❌ Erro ao monitorar: ${err.message}`;
    }
  }

  // Clipboard
  if (categoria === "clipboard") {
    try {
      const lower = limparFiller(texto.toLowerCase().trim());
      if (/^(?:copia|copiar)/i.test(lower)) {
        // Pega o resto do texto como conteúdo
        const m = lower.match(/^(?:copia|copiar)\s+(?:isso|isto|pra\s+area\s+de\s+transferencia|para\s+a\s+area\s+de\s+transferencia)?\s*(.+)/i);
        const conteudo = m?.[1]?.trim() || texto.replace(/^(?:copia|copiar)\s*/i, "").trim();
        if (conteudo && conteudo.length > 2) return await pc.clipboard("copiar", conteudo);
        return "❌ O que você quer copiar?";
      }
      if (/^(?:cola|colar)/i.test(lower)) return await pc.clipboard("colar");
      return await pc.clipboard("colar");
    } catch (err) {
      return `❌ Erro no clipboard: ${err.message}`;
    }
  }

  // Text-to-speech
  if (categoria === "tts") {
    try {
      const lower = limparFiller(texto.toLowerCase().trim());
      const m = lower.match(/^(?:fala|falar|diz|dizer|pronuncia|pronunciar|leia|le|ler)\s+(?:algo|isso|isto|em\s+voz\s+alta|em\s+audio|pelas\s+caixas|pra\s+mim|para\s+mim|esse\s+texto)?\s*(.+)/i);
      const fala = m?.[1]?.trim() || texto.replace(/^(?:fala|falar|diz|dizer|pronuncia|pronunciar|leia|le|ler)\s*(?:algo|isso|isto|em\s+voz\s+alta|em\s+audio|pelas\s+caixas|pra\s+mim|para\s+mim|esse\s+texto)?\s*/i, "").trim();
      if (!fala || fala.length < 2) return "❌ O que você quer que eu fale?";
      return await pc.tts(fala);
    } catch (err) {
      return `❌ Erro no TTS: ${err.message}`;
    }
  }

  // Tradução
  if (categoria === "traducao") {
    try {
      const lower = limparFiller(texto.toLowerCase().trim());
      // Pattern: traduz [texto] de [origem] pra [alvo] ou traduz [texto] pra [alvo]
      let m = lower.match(/^(?:traduz|traduzir|traducao|tradução|translate)\s+(.+?)\s+(?:de|do|da)\s+(\w+)\s+(?:pra|para|em)\s+(\w+)/i);
      if (m) {
        const resultado = await traduzir(m[1].trim(), m[3], m[2]);
        return `🌍 **${m[1].trim()}** (${m[2]} → ${m[3]}):\n${resultado}`;
      }
      m = lower.match(/^(?:traduz|traduzir|traducao|tradução|translate)\s+(.+?)\s+(?:pra|para|em)\s+(\w+)/i);
      if (m) {
        const resultado = await traduzir(m[1].trim(), m[2]);
        return `🌍 **Tradução (→ ${m[2]}):**\n${resultado}`;
      }
      // Só "traduz <texto>" — detecta automaticamente
      m = lower.match(/^(?:traduz|traduzir|traducao|tradução|translate)\s+(.+)/i);
      if (m) {
        const resultado = await traduzir(m[1].trim());
        return `🌍 **Tradução:**\n${resultado}`;
      }
      return "❌ Use: traduz [texto] pra [idioma]";
    } catch (err) {
      return `❌ Erro na tradução: ${err.message}`;
    }
  }

  // Lembrete
  if (categoria === "lembrete") {
    try {
      if (!message) return "❌ Lembrete só funciona no Discord.";
      const lower = limparFiller(texto.toLowerCase().trim());
      const m = lower.match(/(\d+)\s*(?:min|minutos|minuto|s|seg|segundos|segundo|h|hora|horas)\s*(?:pra|para|em|de)?\s*(.+)/i);
      if (!m) return "❌ Use: me lembra em X minutos de Y";
      const valor = parseInt(m[1]);
      const unidade = m[2].includes("h") || /horas?/.test(m[2]) ? "h" : "min";
      // Extrai a mensagem após o tempo
      const msgMatch = lower.match(/(?:pra|para|em|de)\s+(?:me\s+)?(?:lembrar\s+)?(?:de\s+)?(.+)/i);
      const mensagem = msgMatch?.[1]?.trim() || texto;
      const delayMs = unidade === "h" ? valor * 3600000 : valor * 60000;
      const id = await criarLembrete(message.author.id, message.channel, delayMs, mensagem);
      return `⏰ Lembrete criado! Vou te avisar em ${valor} ${unidade === "h" ? "hora(s)" : "minuto(s)"}: "${mensagem}"`;
    } catch (err) {
      return `❌ Erro ao criar lembrete: ${err.message}`;
    }
  }

  // Discord — mudar status
  if (categoria === "statusDiscord") {
    const info = encontrarStatusDiscord(texto);
    if (!info) return `❌ Não entendi qual status você quer. Tente: online, ausente, ocupado, invisível.`;
    if (info.acao === "status") {
      const keyMap = { online: "{Up}", idle: "{Up 2}", dnd: "{Up 3}", invisible: "{Up 4}" };
      const ps = `powershell -Command "$w = New-Object -ComObject wscript.shell; if ($w.AppActivate('Discord')) { Start-Sleep 1; $w.SendKeys('^+s'); Start-Sleep 0.8; $w.SendKeys('${keyMap[info.valor]}{Enter}') }"`;
      const r = await tentar(ps);
      if (r.ok) return `✅ Status do Discord alterado para **${info.valor}**.`;
      return `❌ Não consegui alterar o status. O Discord está aberto?`;
    }
    if (info.acao === "custom") {
      const ps = `powershell -Command "$w = New-Object -ComObject wscript.shell; if ($w.AppActivate('Discord')) { Start-Sleep 1; $w.SendKeys('^+s'); Start-Sleep 0.8; $w.SendKeys('{Tab}{Tab}'); Start-Sleep 0.3; $w.SendKeys('${info.valor}'); Start-Sleep 0.3; $w.SendKeys('{Enter}') }"`;
      const r = await tentar(ps);
      if (r.ok) return `✅ Status customizado definido: "${info.valor}".`;
      return `❌ Não consegui definir o status customizado.`;
    }
  }

  log("INFO", "[ACTION] nenhuma ação reconhecida", { texto });
  return null;
}

module.exports = { executarAcao };