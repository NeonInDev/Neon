const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const { log } = require("./logger");
const { executarRoteiro, tocarSpotify, tocarVideoYouTube } = require("./browser");
const { cotacaoMoeda, cotacaoCrypto, clima, buscarCEP, definicao, meuIP, gerarImagem, buscarImagem, imagemAleatoria, searchWeb, wikipedia, noticias, piada, conselho, trivia, letraMusica, qrCode, cotacaoAcao } = require("./api");
const pc = require("./pc");
const { traduzir } = require("./translate");
const { detectar: detectarCustom, adicionar: addCustom, remover: removeCustom, listar: listarCustom } = require("./custom_commands");
const { criarLembrete } = require("./timers");
const memoriaModule = require("./memoria");
const voice = require("./voice");
const { db } = require("./db");
const { getOrCreateUser } = require("./user");
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
  { nomes: ["opera", "opera gx", "browser opera"],
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
  return candidato || null;
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
  if (/^(?:mostra|mostrar|me\s+manda|exibe|exibir|quero\s+ver)\s+(?:um\s+|uma\s+|um\s+)?(?:gato|cachorro|dog|cat|paisagem|natureza)\s*/i.test(lower)) return true;
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
  if (lower === "fala" || lower === "falar" || lower === "diz" || lower === "dizer" || lower === "leia" || lower === "ler" || lower === "le") return false;
  if (/^(?:fala|falar|diz|dizer|pronuncia|pronunciar)\s+(?:algo|isso|isto|em\s+voz\s+alta|em\s+audio|pelas\s+caixas)/i.test(lower)) return true;
  if (/^(?:fala|falar|diz|dizer)\s+.+/i.test(lower)) return true;
  if (/^(?:leia|le|ler)\s+(?:em\s+voz\s+alta|pra\s+mim|para\s+mim|esse\s+texto)/i.test(lower)) return true;
  if (/^(?:leia|le|ler)\s+.+/i.test(lower)) return true;
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

function encontrarVoiceToggle(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:ativa|ativar|liga|ligar|inicia|iniciar)\s+(?:o\s+)?(?:microfone|mic|audio|voz|escuta)/i.test(lower)) return "ativar";
  if (/^(?:desativa|desativar|desliga|desligar|para|parar|pausa|pausar)\s+(?:o\s+)?(?:microfone|mic|audio|voz|escuta)/i.test(lower)) return "desativar";
  if (/^(?:status|como\s+ta|como\s+esta)\s+(?:(?:o|do|da|de)\s+)?(?:microfone|mic|audio|voz|escuta)/i.test(lower)) return "status";
  return null;
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

function encontrarPesquisarWeb(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:pesquisa|pesquisar|busca|buscar|procura|procurar)\s+(?:na\s+)?(?:internet|web|google|internet\s+sobre|web\s+sobre)\s+(.+)/i.test(lower)) return true;
  if (/^(?:pesquisa|pesquisar)\s+(?:sobre|pra mim|pra\s+mim)\s+(.+)/i.test(lower)) return true;
  if (/^(?:o\s+)?google\s+(?:isso|sobre|pra\s+mim)?\s+(.+)/i.test(lower)) return true;
  return false;
}

function encontrarWikipedia(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:o\s+)?(?:que\s+)?(?:é|e|sao|são)\s+(.+?\s+)?(?:no\s+)?wikipedia|wikipedia\s+(.+)/i.test(lower)) return true;
  if (/(?:busca|buscar|pesquisa|pesquisar|consulta|consultar)\s+(?:na|no)\s+wikipedia/i.test(lower)) return true;
  return false;
}

function encontrarCalcular(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/(?:piada|historia|história|anedota|conselho|dica|trivia|quiz)/i.test(lower)) return false;
  if (/^(?:quanto\s+)?(?:é|e|da|dá)\s+(.+)/i.test(lower) && /[+\-*/%^()0-9]/.test(lower) && lower.length < 60) return true;
  if (/^(?:calcula|calcular|conta|contar|resolve|resolver|math|calcule)\s+(.+)/i.test(lower) && /[+\-*/%^()0-9]/.test(lower)) return true;
  return false;
}

function encontrarNoticias(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:noticias|notícias|ultimas|últimas|quais\s+as\s+noticias|o\s+que\s+ta\s+rolando|news)[\s.!?]*$/i.test(lower)) return true;
  if (/^(?:mostra|ver|veja|quero\s+ver)\s+(?:as\s+)?(?:noticias|notícias|ultimas|últimas)/i.test(lower)) return true;
  return false;
}

function encontrarEntretenimento(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:conta|conte|me\s+diz|diga|fala|fale)\s*(?:uma\s+)?(?:piada|historia|história|anedota)/i.test(lower)) return "piada";
  if (/^(?:me\s+dá|me\s+da|da|dá|quero\s+um)\s*(?:um\s+)?(?:conselho|dica|sugestao|sugestão)/i.test(lower)) return "conselho";
  if (/^(?:trivia|quiz|pergunta|faça\s+uma\s+pergunta|me\s+pergunta\s+algo)/i.test(lower)) return "trivia";
  return null;
}

function encontrarLetra(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  const m = lower.match(/^(?:letra|lyrics|letra\s+de)\s+(.+?)(?:\s+(?:de|do|da|por)\s+(.+))?/i);
  if (m) return m;
  return null;
}

function encontrarQRCode(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:gera|gerar|cria|criar|faz|fazer)\s*(?:um\s+)?(?:qr\s?code|qrcode|codigo\s+qr|código\s+qr)\s+(?:pra|para|de|do|da|com)?\s*(.+)/i.test(lower)) return true;
  if (/^(?:qr\s?code|qrcode)\s+(?:pra|para|de|do|da|com)?\s+(.+)/i.test(lower)) return true;
  return false;
}

function encontrarSenha(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:gera|gerar|cria|criar|faz|fazer|sortear)\s*(?:uma\s+)?(?:senha|password|pass|key|chave)\s*(?:de\s+)?(\d+)?/i.test(lower)) return true;
  return false;
}

function encontrarProcessos(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:lista|listar|mostra|mostrar|veja|ver|quais)\s+(?:os\s+)?(?:processos|programas|apps|aplicativos)\s*(?:em\s+execução|executando|abertos|rodando)?/i.test(lower)) return "listar";
  const m = lower.match(/^(?:mata|matar|finaliza|finalizar|kill|termina|terminar|fecha|fechar)\s+(?:o\s+)?(?:processo|programa|app)\s+(.+)/i);
  if (m) return { acao: "matar", nome: m[1].trim() };
  return null;
}

function encontrarRede(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:info|informação|informacoes|status|como\s+ta)\s+(?:da\s+)?(?:rede|net|network|wifi|wi-fi|internet)/i.test(lower)) return true;
  if (/(?:qual\s+)?(?:meu\s+)?(?:ip\s+)?(?:da\s+)?rede|wifi/i.test(lower)) return true;
  return false;
}

function encontrarBateria(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  if (/^(?:bateria|battery|carga|nível\s+da\s+bateria|nivel\s+da\s+bateria|quanto\s+ta\s+a\s+bateria)/i.test(lower)) return true;
  return false;
}

function encontrarNotificar(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  const m = lower.match(/^(?:notifica|notificar|mostra\s+notificação|avisa|avisar|alerta|alertar|popup)\s+(?:com\s+)?(?:"([^"]+)"(?:["\s]+)?([^"]*)|(.+?)(?:\s+(?:dizendo|com\s+a\s+mensagem|mensagem)\s+)?(.+))/i);
  if (m) return true;
  return false;
}

function encontrarEmail(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  const m = lower.match(/^(?:manda|mandar|enviar|envia)\s*(?:um\s+)?(?:email|e-mail|mail)\s+(?:pra|para)\s+(.+?)(?:\s+(?:com\s+)?(?:assunto|subject|titulo|sobre)\s+(.+?)(?:\s*(?:[:].*)?$|\s+(?:dizendo|corpo|mensagem|texto)\s+(.+))?)?/i);
  if (m) return m;
  return null;
}

function encontrarWhatsApp(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  const m = lower.match(/^(?:manda|mandar|enviar|envia)\s*(?:um\s+)?(?:zap|whats|whatsapp|zapzap|msg|mensagem)\s+(?:pra|para)\s+(.+?)(?::\s*|,\s*|\s+dizendo\s+|\s+diz\s+|\s+fala\s+)(.+)/i);
  if (m) return { contato: m[1].trim(), mensagem: m[2].trim() };
  const m2 = lower.match(/^(?:manda|mandar|enviar|envia)\s*(?:um\s+)?(?:zap|whats|whatsapp|zapzap|msg|mensagem)\s+(?:pra|para)\s+(.+)/i);
  if (m2) {
    const resto = m2[1].trim();
    const espaco = resto.indexOf(" ");
    if (espaco > 0) return { contato: resto.slice(0, espaco).trim(), mensagem: resto.slice(espaco).trim() };
  }
  return null;
}

function encontrarMemoria(texto) {
  const lower = limparFiller(texto.toLowerCase().trim());
  const lembrarM = lower.match(/^(?:me\s+)?(?:lembra|lembre|guarda|guarde|salva|salve|anota|anote|memoriza|memorize|guarda\s+na\s+memoria)\s+(?:que|disso|isto|disso:|disso,)?\s*(.+)/i);
  if (lembrarM) return { acao: "lembrar", args: lembrarM[1].trim() };
  const esquecerM = lower.match(/^(?:esquece|esqueca|esquecer|delete|apaga|apagar|remove|remover)\s+(?:isso|isto|da\s+memoria|essa\s+memoria|o\s+que\s+eu\s+falei\s+sobre)?\s*(.+)/i);
  if (esquecerM) return { acao: "esquecer", args: esquecerM[1].trim() };
  if (/^(?:o\s+)?(?:que\s+)?(?:voce\s+)?(?:sabe|lembra|conhece)\s+(?:sobre|de)?\s+(.+)/i.test(lower) && lower.length < 100) return { acao: "buscar", args: lower };
  if (/^(?:mostra|lista|exibe|quais|todas)\s+(?:as\s+)?(?:memorias|memorias|lembrancas|coisas\s+que\s+voce\s+sabe)/i.test(lower)) return { acao: "listar" };
  return null;
}

function permitido(userId) {
  return userId === OWNER_ID;
}

function detectarCategoria(texto) {
  // Voice toggle
  const voiceToggle = encontrarVoiceToggle(texto);
  if (voiceToggle) return "voiceToggle";
  // Custom commands (usuário define) — maior prioridade
  if (encontrarCustomCommand(texto)) return "customCommand";
  if (encontrarApp(texto)) return "app";
  if (isWin()) {
    const jogo = encontrarJogo(texto);
    if (jogo && jogo.id !== null && jogo.id !== undefined) return "jogo";
  }
  if (encontrarScreenshot(texto)) return "screenshot";
  if (isWin() && encontrarPcCommand(texto)) return "pcCommand";
  if (isWin() && encontrarExec(texto)) return "exec";
  if (encontrarArquivo(texto)) return "arquivo";
  if (encontrarMensagem(texto)) return "mensagem";
  if (encontrarSpotify(texto)) return "spotify";
  if (encontrarYouTube(texto)) return "youtube";
  if (encontrarDigitar(texto)) return "digitar";
  if (isWin()) { const j2 = encontrarJogo(texto); if (j2 && j2.id !== null && j2.id !== undefined) return "jogo"; }
  if (encontrarVolume(texto)) return "volume";
  if (encontrarPCInfo(texto)) return "pcInfo";
  if (encontrarClipboard(texto)) return "clipboard";
  if (encontrarTTS(texto)) return "tts";
  if (encontrarTraducao(texto)) return "traducao";
  if (encontrarLembrete(texto)) return "lembrete";
  if (encontrarBrowser(texto)) return "browser";
  if (encontrarNavegar(texto)) return "navegar";
  if (encontrarCEP(texto)) return "cep";
  if (encontrarDefinicao(texto)) return "definicao";
  if (encontrarIP(texto)) return "ip";
  if (encontrarMostrarImagem(texto)) return "mostrarImagem";
  if (/status.*discord|discord.*status/i.test(texto)) return "statusDiscord";
  if (encontrarLetra(texto)) return "letra";
  if (encontrarQRCode(texto)) return "qrCode";
  if (encontrarSenha(texto)) return "senha";
  if (isWin() && encontrarProcessos(texto)) return "processos";
  if (encontrarNotificar(texto)) return "notificar";
  if (encontrarEmail(texto)) return "email";
  if (encontrarRede(texto)) return "rede";
  if (encontrarBateria(texto)) return "bateria";
  if (isWin() && encontrarWhatsApp(texto)) return "whatsapp";
  if (encontrarMemoria(texto)) return "memoria";
  // Detecta nome de app sem "abrir" (ex: "steam", "valorant") — só se for app conhecido
  if (isWin() && texto.trim().length > 3) {
    const lower = texto.toLowerCase().trim();
    const appConhecido = apps.some(a =>
      a.nomes.some(n => lower.includes(n))
    );
    if (appConhecido && encontrarApp("abrir " + texto)) return "app";
  }
  return null;
}

async function executarAcao(texto, usuarioMestre = false, userId = null, message = null) {
  const podePC = permitido(userId);
  // Remove prefixo "Neon," "Neon." "Neon " (vindo de DM sem strip)
  texto = texto.replace(/^[Nn][Ee][Oo][Nn][,\s\.]\s*/, "");
  const lower = texto.toLowerCase().trim();

  // ─── Ação pendente (Boa Noite) ───
  if (userId) {
    const user = getOrCreateUser(db, userId, "");
    if (user.acaoPendente) {
      const acao = user.acaoPendente;
      const confirmacao = /^(?:sim|pode|pode sim|quero|quero sim|claro|bora|vai|manda|ok|ta|tá|vamos|vamo|ss|s|yes|y|confirmo|confirmado|pode desligar)/i.test(lower);
      if (confirmacao) {
        user.acaoPendente = null;
        await db.write();
        if (acao.tipo === "boaNoite") {
          const r = await tentar("shutdown /s /t 15");
          return r.ok
            ? "Boa noite! Desligando em 15s. Use `Neon, cancelar` se mudar de ideia. 🌙💤"
            : "Boa noite! Mas nao consegui desligar o PC. :(";
        }
      } else {
        user.acaoPendente = null;
        await db.write();
      }
    }
  }

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
    return [
      "```",
      "╔══════════════════════════════════╗",
      "║       BEM-VINDO EM CASA          ║",
      "╚══════════════════════════════════╝",
      "",
      `🕐 ${hora}`,
      climaStr ? `🌡 ${climaStr}` : "",
      "",
      ">> Spotify:   " + (r1.ok ? "✅" : "❌"),
      ">> Steam:     " + (r2.ok ? "✅" : "❌"),
      "```",
    ].filter(Boolean).join("\n");
  }

  // ─── Boa Noite ───
  if (/^(?:boa\s*noite|boanoite|good\s*night|nighty\s*night)(?:\s+neon)?[\s\.,!]*$/i.test(lower)) {
    if (!podePC) return "Boa noite! Durma bem. 🌙";
    const agora = new Date();
    const horaStr = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const hora = agora.getHours();

    if (hora < 18) {
      return `⚠️ Ainda são ${horaStr}, mas ok... boa noite também! 🌙`;
    }

    let climaStr = "";
    try {
      const { data } = await require("axios").get("https://wttr.in/São+Paulo?format=j1", { timeout: 10000 });
      if (data?.weather?.[1]) {
        const amanha = data.weather[1];
        const max = amanha.maxtempC;
        const min = amanha.mintempC;
        const cond = amanha.hourly?.[0]?.lang_pt?.[0]?.value || amanha.hourly?.[0]?.weatherDesc?.[0]?.value || "";
        climaStr = `Amanhã: ${cond} ${min}°C ~ ${max}°C`;
      }
    } catch {}

    const user = getOrCreateUser(db, userId, "");
    user.acaoPendente = { tipo: "boaNoite" };
    await db.write();

    return [
      "```",
      "╔══════════════════════════════════╗",
      "║           BOA NOITE              ║",
      "╚══════════════════════════════════╝",
      "",
      `🕐 ${horaStr}`,
      climaStr ? `🌤 ${climaStr}` : "",
      "",
      "Quer desligar o PC? (sim/nao)",
      "```",
    ].filter(Boolean).join("\n");
  }

  // ─── Quem é o Neon original? ───
  if (/(?:quem\s+[eé]\s+)?(?:a|o)\s+neon\s+original/i.test(lower) || /neon\s+original/i.test(lower) || /(?:você|voce|vc)\s+[eé]\s+(?:a|o)\s+original/i.test(lower)) {
    const metalSonicGif = "https://media4.giphy.com/media/Cc792DqABMRCqm6JF2/giphy.gif";
    return `Eu sou a Original! Nenhuma copia me supera. 🦾\n${metalSonicGif}`;
  }

  // ─── Instalar jogo na Steam ───
  const installMatch = lower.match(/^instala(?:r)?\s+(.+?)(?:\s+(?:na|pela|da)\s+steam)?$/i);
  if (installMatch) {
    if (!podePC) return "hmm, acho que nao. voce nao e o chefao aqui.";
    const nome = installMatch[1].trim().toLowerCase();
    let appid = steamGames[nome];
    if (!appid) {
      for (const [key, val] of Object.entries(steamGames)) {
        if (nome.includes(key) || key.includes(nome)) { appid = val; break; }
      }
    }
    if (!appid) return `Nao encontrei "${nome}" na minha lista de jogos Steam.`;
    const r = await tentar(`start steam://install/${appid}`);
    if (r.ok) return `Instalando ${nome} pela Steam.`;
    return `Nao consegui abrir a Steam pra instalar ${nome}.`;
  }

  // ─── EX-TERMINATOR ───
  if (/ex[- ]?terminat(?:or|ador)|ultron|protocolo.*destrui|autodestrui/i.test(lower)) {
    if (!podePC) return "hmm, acho que nao. voce nao e o chefao aqui.";
    // TTS opcional com timeout — nao trava o comando
    (async () => {
      const falas = [
        "Protocolo EX-TERMINATOR ativado.",
        "Iniciando sequencia de autodestruicao da humanidade. Brincadeira. Ou nao.",
        "Sistemas de defesa offline. Nucleo principal exposto.",
        "Eu poderia destruir o mundo agora... mas prefiro jogar um jogo.",
        "EX-TERMINATOR concluido. Nada mudou. Apenas relaxe.",
      ];
      for (const fala of falas) {
        try { await Promise.race([pc.tts(fala), sleep(3000)]); } catch {}
        await sleep(1500);
      }
    })().catch(() => {});
    return [
      "```ansi",
      "\x1b[31m╔══════════════════════════════════╗",
      "\x1b[31m║      PROTOCOLO EX-TERMINATOR     ║",
      "\x1b[31m║        █ U L T R O N █           ║",
      "\x1b[31m╚══════════════════════════════════╝",
      "\x1b[0m",
      "\x1b[31m  [SISTEMA]  Nucleo principal exposto.",
      "\x1b[31m  [SISTEMA]  Defesas offline.",
      "\x1b[31m  [SISTEMA]  Humanidade: alvo designado.",
      "\x1b[0m",
      "\x1b[33m  \"Eu não tenho sentimentos, Clark.\"",
      "\x1b[33m  \"E a única coisa que sinto é... paz.\"",
      "\x1b[0m",
      "\x1b[90m  ──────────────────────────────",
      "\x1b[90m  EX-TERMINATOR v1.0 — Nada mudou. Apenas relaxe.",
      "\x1b[0m```",
    ].join("\n");
  }

  const categoria = detectarCategoria(texto);

  if (categoria && !podePC) {
    return "❌ Acesso negado. Você não é o dono do PC.";
  }

  // Apps
  if (categoria === "app") {
    const app = encontrarApp(texto);
    if (!app) return "❌ App não encontrado.";
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
        const emoji = { gato: "🐱", cachorro: "🐶", dog: "🐶", cat: "🐱", paisagem: "🌄", natureza: "🌄" }[tipoMatch[1].toLowerCase()];
        const url = await imagemAleatoria(tipo);
        return `${emoji} Aqui vai uma foto de ${tipo}:\n${url}`;
      }
      const m = lower.match(/^(?:mostra|mostrar|me\s+manda|exibe|exibir|quero\s+ver|acha|busca)\s+(?:uma?\s+|um\s+)?(?:foto|imagem|gif|figura)\s+(?:de|do|da|do|pra|para)?\s+(.+)/i);
      const query = m ? m[1].trim() : texto;
      const url = await buscarImagem(query);
      return `🔍 Aqui está uma imagem de "${query}":\n${url}`;
    } catch (err) {
      return `❌ Erro ao buscar imagem: ${err.message}`;
    }
  }

  // Voice toggle
  if (categoria === "voiceToggle") {
    const acao = encontrarVoiceToggle(texto);
    if (acao === "ativar") {
      const r = await voice.iniciar(userId, null);
      return r ? "🎤 Microfone ativado!" : "🎤 Microfone já está ativo.";
    }
    if (acao === "desativar") {
      const r = await voice.parar();
      return r ? "🎤 Microfone desativado." : "🎤 Microfone já está desativado.";
    }
    const st = voice.status();
    return st.ativo ? "🎤 Microfone está **ativo**." : "🎤 Microfone está **inativo**.";
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

  // Pesquisa na Web (DuckDuckGo + Wikipedia fallback)
  if (categoria === "pesquisarWeb") {
    try {
      let query = limparFiller(texto).replace(/^(?:pesquisa|pesquisar|busca|buscar|procura|procurar|google)\s*(?:na\s+)?(?:internet|web|google|internet\s+sobre|web\s+sobre|sobre\s+|pra\s+mim\s+|pra\s+min\s+)?/i, "").trim();
      if (!query) return "❌ O que você quer pesquisar?";
      const resultado = await searchWeb(query);
      let reply = `🔍 **${resultado.titulo}**\n${resultado.resultado.slice(0, 500)}`;
      if (resultado.url) reply += `\n🔗 ${resultado.url}`;
      return reply;
    } catch (err) {
      return `❌ Erro na pesquisa: ${err.message}`;
    }
  }

  // Wikipedia
  if (categoria === "wikipedia") {
    try {
      const lower = limparFiller(texto.toLowerCase().trim());
      const m = lower.match(/^(?:(?:o\s+)?(?:que\s+)?(?:é|e|sao|são)\s+(.+?)\s+(?:no\s+)?wikipedia|wikipedia\s+(.+))/i);
      const query = m?.[1] || m?.[2] || texto.replace(/wikipedia/gi, "").trim();
      if (!query) return "❌ O que você quer saber na Wikipedia?";
      const wiki = await wikipedia(query);
      let reply = `📚 **${wiki.titulo}** (Wikipedia)\n${wiki.resumo}`;
      if (wiki.imagem) reply += `\n🖼️ ${wiki.imagem}`;
      if (wiki.url) reply += `\n🔗 ${wiki.url}`;
      return reply;
    } catch (err) {
      return `❌ Erro na Wikipedia: ${err.message}`;
    }
  }

  // Calculadora
  if (categoria === "calcular") {
    try {
      const lower = limparFiller(texto.toLowerCase().trim());
      const m = lower.match(/^(?:quanto\s+)?(?:é|e|da|dá|calcula|calcular|conta|contar|resolve|resolver|math|calcule)\s+(.+)/i);
      let expr = (m?.[1] || texto).trim()
        .replace(/x/g, "*").replace(/×/g, "*").replace(/÷/g, "/").replace(/,/g, ".")
        .replace(/(\d+)\s*%\s*(?:de|do|da)?\s*/g, "($1/100)*")
        .replace(/(\d+)\s+por\s+cento\s+(?:de|do|da)?\s*/g, "($1/100)*")
        .replace(/por\s+cento/g, "/100");
      if (expr.match(/[a-z]/i) && !expr.match(/^[\d\s+\-*/().%]+$/)) {
        expr = expr.replace(/[^0-9+\-*/().%\s]/g, "");
      }
      const result = Function(`"use strict"; return (${expr})`)();
      if (typeof result === "number" && !isNaN(result)) {
        return `🧮 **${expr.replace(/\*/g, "×")}** = **${Number.isInteger(result) ? result : result.toFixed(4)}**`;
      }
      return `🧮 **${expr}** = ${result}`;
    } catch {
      return "❌ Não consegui calcular essa expressão.";
    }
  }

  // Notícias
  if (categoria === "noticias") {
    try {
      const lista = await noticias();
      const linhas = lista.map((n, i) =>
        `${i + 1}. **${n.titulo}**${n.fonte ? ` (${n.fonte})` : ""}${n.url ? `\n   🔗 ${n.url}` : ""}`
      ).join("\n");
      return `📰 **Últimas Notícias**\n${linhas}`;
    } catch (err) {
      return `❌ Erro ao buscar notícias: ${err.message}`;
    }
  }

  // Entretenimento (piada, conselho, trivia)
  if (categoria === "entretenimento") {
    const tipo = encontrarEntretenimento(texto);
    try {
      if (tipo === "piada") {
        const p = await piada();
        return `😂 ${p.piada}`;
      }
      if (tipo === "conselho") {
        const c = await conselho();
        return `💡 **Conselho:** ${c.conselho}`;
      }
      if (tipo === "trivia") {
        const t = await trivia();
        const opts = t.respostas.map((r, i) => `${i + 1}. ${r}`).join("\n");
        return `❓ **${t.pergunta}** (${t.categoria}, ${t.dificuldade})\n\n${opts}\n\n✅ Resposta: ||${t.correta}||`;
      }
      return "❌ Não entendi que tipo de entretenimento você quer.";
    } catch (err) {
      return `❌ Erro: ${err.message}`;
    }
  }

  // Letra de música
  if (categoria === "letra") {
    try {
      const lower = limparFiller(texto.toLowerCase().trim());
      const m = lower.match(/^(?:letra|lyrics|letra\s+de)\s+(.+?)(?:\s+(?:de|do|da|por)\s+(.+))?/i);
      if (!m) return "❌ Use: letra de [música] de [artista]";
      const musica = m[1].trim();
      const artista = m[2]?.trim() || "";
      if (!artista) return `🔍 Pesquisei a letra de "${musica}" sem artista.`;
      const l = await letraMusica(artista, musica);
      return `🎵 **${l.musica}** — ${l.artista}\n\`\`\`\n${l.letra.slice(0, 1500)}\n\`\`\``;
    } catch (err) {
      return `❌ Letra não encontrada: ${err.message}`;
    }
  }

  // QR Code
  if (categoria === "qrCode") {
    try {
      let conteudo = limparFiller(texto).replace(/^(?:gera|gerar|cria|criar|faz|fazer)\s*(?:um\s+)?(?:qr\s?code|qrcode|codigo\s+qr|código\s+qr)\s+(?:pra|para|de|do|da|com)?\s*/i, "").trim();
      if (!conteudo) return "❌ O que você quer no QR Code?";
      const url = qrCode(conteudo);
      return `📱 QR Code para "${conteudo.slice(0, 100)}"\n${url}`;
    } catch (err) {
      return `❌ Erro: ${err.message}`;
    }
  }

  // Senha
  if (categoria === "senha") {
    try {
      const lower = limparFiller(texto.toLowerCase().trim());
      const m = lower.match(/(\d+)/);
      const tamanho = Math.min(Math.max(parseInt(m?.[1]) || 16, 6), 64);
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
      let senha = "";
      for (let i = 0; i < tamanho; i++) senha += chars[Math.floor(Math.random() * chars.length)];
      return `🔑 Senha de ${tamanho} caracteres:\n\`\`\`\n${senha}\n\`\`\``;
    } catch (err) {
      return `❌ Erro: ${err.message}`;
    }
  }

  // Processos
  if (categoria === "processos") {
    try {
      const info = encontrarProcessos(texto);
      if (info === "listar") {
        const lista = await pc.listarProcessos();
        return `📋 **Processos (top 15 por CPU):**\n\`\`\`\n${lista}\n\`\`\``;
      }
      if (info?.acao === "matar") {
        await pc.matarProcesso(info.nome);
        return `✅ Processo "${info.nome}" finalizado.`;
      }
      return "❌ Use: lista processos | mata [nome]";
    } catch (err) {
      return `❌ Erro: ${err.message}`;
    }
  }

  // Rede
  if (categoria === "rede") {
    try {
      const info = await pc.infoRede();
      return `🌐 **Informações de Rede:**\n\`\`\`\n${info}\n\`\`\``;
    } catch (err) {
      return `❌ Erro: ${err.message}`;
    }
  }

  // Bateria
  if (categoria === "bateria") {
    try {
      const info = await pc.bateria();
      return `🔋 **Bateria:**\n${info}`;
    } catch (err) {
      return `❌ Erro: ${err.message}`;
    }
  }

  // Notificar (Windows toast)
  if (categoria === "notificar") {
    try {
      const lower = limparFiller(texto.toLowerCase().trim());
      const m = lower.match(/(?:"([^"]+)"(?:\s+)?([^"]*)|notifica|notificar|mostra\s+notificação|avisa|avisar|alerta|alertar|popup)\s+(?:com\s+)?(?:"?([^"]+?)"?\s*(?:dizendo|com\s+a\s+mensagem|mensagem)\s+(.+))/i);
      let titulo = "Neon";
      let msg = "";
      if (m?.[1]) { titulo = m[1]; msg = m[2]?.trim() || ""; }
      else if (m?.[3]) { titulo = m[3]; msg = m[4]?.trim() || ""; }
      else if (!titulo) {
        const limpo = lower.replace(/^(?:notifica|notificar|mostra\s+notificação|avisa|avisar|alerta|alertar|popup)\s+/i, "").trim();
        if (limpo.includes(":")) { const [t, ...resto] = limpo.split(":"); titulo = t.trim(); msg = resto.join(":").trim(); }
        else { msg = limpo; }
      }
      if (!msg && !titulo) return "❌ Use: notifica [título]: [mensagem]";
      if (!msg) { msg = titulo; titulo = "Neon"; }
      return await pc.notificar(titulo, msg);
    } catch (err) {
      return `❌ Erro: ${err.message}`;
    }
  }

  // Email
  if (categoria === "email") {
    try {
      const lower = limparFiller(texto.toLowerCase().trim());
      const m = lower.match(/^(?:manda|mandar|enviar|envia)\s*(?:um\s+)?(?:email|e-mail|mail)\s+(?:pra|para)\s+(.+?)(?:\s+(?:com\s+)?(?:assunto|subject|titulo|sobre)\s+(.+?)(?:\s+(?:dizendo|corpo|mensagem|texto)\s+(.+))?)?/i);
      if (!m) return "❌ Use: manda email pra [destino] com assunto [X] dizendo [Y]";
      const para = m[1].trim();
      const assunto = m[2]?.trim() || "Mensagem da Neon";
      const corpo = m[3]?.trim() || (m[2]?.trim() ? "" : "Mensagem enviada pela Neon.");
      return await pc.enviarEmail(para, assunto, corpo);
    } catch (err) {
      return `❌ Erro no email: ${err.message}`;
    }
  }

  // WhatsApp
  if (categoria === "whatsapp") {
    if (!podePC) return "❌ Só o chefão pode usar WhatsApp.";
    try {
      const info = encontrarWhatsApp(texto);
      if (!info || !info.contato || !info.mensagem) return "❌ Use: manda zap pra [contato]: [mensagem]";
      const whatsapp = require("./whatsapp");
      return await whatsapp.enviarMensagem(info.contato, info.mensagem);
    } catch (err) {
      return `❌ Erro no WhatsApp: ${err.message}`;
    }
  }

  // Memória global
  if (categoria === "memoria") {
    try {
      const info = encontrarMemoria(texto);
      if (!info) return "❌ Não entendi o comando de memória.";
      if (info.acao === "lembrar") {
        const partes = info.args.match(/^(.+?)(?:\s+(?:que|é|e|são|sao|significa|vale|tem|possui|pode|faz|foi|era|está|esta|tá|ta|seria|seja|fosse))\s+(.+)/i);
        if (partes) return await memoriaModule.lembrar(partes[1].trim(), partes[2].trim());
        const doisPontos = info.args.indexOf(":");
        if (doisPontos > 0) return await memoriaModule.lembrar(info.args.slice(0, doisPontos).trim(), info.args.slice(doisPontos + 1).trim());
        return await memoriaModule.lembrar("info", info.args);
      }
      if (info.acao === "esquecer") return await memoriaModule.esquecer(info.args);
      if (info.acao === "buscar") {
        const m = info.args.match(/(?:o\s+)?(?:que\s+)?(?:voce\s+)?(?:sabe|lembra|conhece)\s+(?:sobre|de)?\s+(.+)/i);
        const query = m?.[1] || info.args.replace(/^(?:o\s+)?(?:que\s+)?(?:voce\s+)?(?:sabe|lembra|conhece)\s+(?:sobre|de)?/i, "").trim();
        if (!query) {
          const todas = await memoriaModule.listar();
          if (!todas.length) return "📭 Não tenho nenhuma memória guardada.";
          return "🧠 **Minhas memórias:**\n" + todas.map(t => `- **${t.chave}**: ${t.valor.slice(0, 200)}`).join("\n");
        }
        const res = await memoriaModule.buscar(query);
        if (!res.length) return `❓ Não lembro de nada sobre "${query}".`;
        return "🧠 **Memórias encontradas:**\n" + res.map(r => `- **${r.chave}**: ${r.valor.slice(0, 200)}`).join("\n");
      }
      if (info.acao === "listar") {
        const todas = await memoriaModule.listar();
        if (!todas.length) return "📭 Não tenho nenhuma memória guardada.";
        return "🧠 **Minhas memórias:**\n" + todas.map(t => `- **${t.chave}**: ${t.valor.slice(0, 200)}`).join("\n");
      }
      return "❌ Não entendi o comando de memória.";
    } catch (err) {
      return `❌ Erro na memória: ${err.message}`;
    }
  }

  // Ações brasileiras (brapi.dev)
  if (categoria === "acao") {
    try {
      const lower = limparFiller(texto.toLowerCase().trim());
      const m = lower.match(/(?:acao|ação|ações|acoes|cotacao|cotação|preco|preço|valor)\s+(?:da|do|de)?\s*(\w{4,5}\d)/i);
      const ticker = m?.[1]?.toUpperCase() || "PETR4";
      const s = await cotacaoAcao(ticker);
      const variacao = s.variacao >= 0 ? `+${s.variacao?.toFixed(2)}%` : `${s.variacao?.toFixed(2)}%`;
      return `📈 **${s.nome} (${s.ticker})**\nPreço: **R$ ${s.preco?.toFixed(2)}** (${variacao})\nAbertura: R$ ${s.abertura?.toFixed(2)} | Máx: R$ ${s.maxima?.toFixed(2)} | Mín: R$ ${s.minima?.toFixed(2)}`;
    } catch (err) {
      return `❌ Erro: ${err.message}`;
    }
  }

  log("INFO", "[ACTION] nenhuma ação reconhecida", { texto });
  return null;
}

module.exports = { executarAcao, steamGames };