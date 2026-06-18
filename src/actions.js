const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const { log } = require("./logger");
const { executarRoteiro, tocarSpotify, tocarVideoYouTube } = require("./browser");
const { cotacaoMoeda, cotacaoCrypto } = require("./api");
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
  { nomes: ["spotify"],           url: "https://open.spotify.com", comando: "start spotify:" },
  { nomes: ["steam"],             url: "https://store.steampowered.com", comando: "start steam:" },
  { nomes: ["riot", "riot client", "league", "lol", "valorant"],
                                  url: "https://riotgames.com", comando: "start riot" },
  { nomes: ["youtube", "yt"],     url: "https://youtube.com" },
  { nomes: ["chrome"],            url: "https://google.com" },
  { nomes: ["whatsapp", "zap"],   url: "https://wa.me" },
  { nomes: ["telegram", "tg"],    url: "https://t.me" },
  { nomes: ["instagram", "insta"], url: "https://instagram.com" },
  { nomes: ["twitter", "x"],      url: "https://x.com" },
  { nomes: ["discord"],           url: "https://discord.com/channels/@me" },
  { nomes: ["gmail", "email"],    url: "https://mail.google.com" },
  { nomes: ["maps", "mapa"],      url: "https://maps.google.com" },
  { nomes: ["camera", "câmera"],  comando: "am start --user 0 -a android.media.action.IMAGE_CAPTURE", so: "android" },
  { nomes: ["config", "configuração", "configuracoes", "ajustes", "settings"],
                                  comando: "am start --user 0 -a android.settings.SETTINGS", so: "android" },
  { nomes: ["explorador", "explorer", "arquivos"],
                                  comando: "start explorer", so: "win32" },
  { nomes: ["bloco de notas", "bloco", "notepad"],
                                  comando: "start notepad", so: "win32" },
  { nomes: ["cmd", "terminal", "prompt"],
                                  comando: "start cmd", so: "win32" },
  { nomes: ["powershell"],
                                  comando: "start powershell", so: "win32" },
  { nomes: ["calculadora", "calc"],
                                  comando: "start calc", so: "win32" },
  { nomes: ["painel de controle", "painel", "control"],
                                  comando: "start control", so: "win32" },
  { nomes: ["navegador", "browser", "opera gx", "opera"],
                                  url: "https://google.com" },
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
  if (isWin()) {
    const jogo = encontrarJogo(texto);
    if (jogo && jogo.id !== undefined) return "jogo";
  }
  if (encontrarApp(texto)) return "app";
  if (isWin() && encontrarPcCommand(texto)) return "pcCommand";
  if (isWin() && encontrarExec(texto)) return "exec";
  if (encontrarArquivo(texto)) return "arquivo";
  if (encontrarMensagem(texto)) return "mensagem";
  if (encontrarSpotify(texto)) return "spotify";
  if (encontrarYouTube(texto)) return "youtube";
  if (encontrarPesquisa(texto)) return "pesquisa";
  if (encontrarDigitar(texto)) return "digitar";
  if (isWin() && encontrarJogo(texto)) return "jogo";
  if (encontrarBrowser(texto)) return "browser";
  if (encontrarNavegar(texto)) return "navegar";
  if (encontrarCotacao(texto)) return "cotacao";
  return null;
}

async function executarAcao(texto, usuarioMestre = false, userId = null) {
  const podePC = permitido(userId);
  // Remove prefixo "Neon," "Neon." "Neon " (vindo de DM sem strip)
  texto = texto.replace(/^[Nn][Ee][Oo][Nn][,\s\.]\s*/, "");
  const lower = texto.toLowerCase().trim();

  // ─── Daddy is home ───
  if (lower === "daddy is home" || lower === "daddy's home") {
    if (!podePC) return "hmm, acho que nao. voce nao e o chefao aqui.";
    await tentar('start spotify:');
    await tentar('start steam:');
    setTimeout(() => {
      execCb('taskkill /f /im Spotify.exe 2>nul & taskkill /f /im Steam.exe 2>nul', () => {});
    }, 7000);
    return [
      "```",
      "   ╔══════════════════════════════════╗",
      "   ║          INICIANDO SISTEMAS       ║",
      "   ╚══════════════════════════════════╝",
      "```",
      "",
      "Bem-vindo em casa, chefe.",
      "",
      "```",
      "[NEON OS v3.1.7]  Protocolo de boas-vindas ativado.",
      "────────────────────────────────────────────",
      "  >>  Autenticacao biométrica:   OK",
      "  >>  Rede doméstica:            OK",
      "  >>  Assinatura de voz:         \"" + (texto.includes("Daddy") ? "Daddy" : "Chefe") + " identificado\"",
      "  >>  Spotify:                   ABRINDO...",
      "  >>  Steam:                     ABRINDO...",
      "  >>  Café:                      ¯\\_(ツ)_/¯ (vai ter que fazer)",
      "────────────────────────────────────────────",
      "```",
      "",
      "Fechando tudo em 7s... so pra mostrar servico. 🤖",
    ].join("\n");
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
    const video = encontrarYouTube(texto);
    try {
      const msg = await tocarVideoYouTube(video);
      return msg;
    } catch (err) {
      return `❌ Não consegui tocar no YouTube: ${err.message}`;
    }
  }

  // Spotify — tocar música (app desktop + fallback web)
  if (categoria === "spotify") {
    const musica = encontrarSpotify(texto);
    // Tenta pelo app desktop: abre busca + Down + Enter
    let desktopOk = false;
    const buscaCmd = `start spotify:search:${encodeURIComponent(musica)}`;
    const r1 = await tentar(buscaCmd);
    if (r1.ok) {
      await sleep(4000);
      const psCmds = [
        // Tenta Down + Enter (busca → primeiro resultado → toca)
        `powershell -Command "$w = New-Object -ComObject wscript.shell;if($w.AppActivate('Spotify Premium')){Start-Sleep 1.5;$w.SendKeys('{DOWN}');Start-Sleep 0.5;$w.SendKeys('{ENTER}')}"`,
        `powershell -Command "$w = New-Object -ComObject wscript.shell;if($w.AppActivate('Spotify Free')){Start-Sleep 1.5;$w.SendKeys('{DOWN}');Start-Sleep 0.5;$w.SendKeys('{ENTER}')}"`,
        `powershell -Command "$w = New-Object -ComObject wscript.shell;if($w.AppActivate('Spotify')){Start-Sleep 1.5;$w.SendKeys('{DOWN}');Start-Sleep 0.5;$w.SendKeys('{ENTER}')}"`,
        // Fallback: Enter direto (se já tiver foco no resultado)
        `powershell -Command "$w = New-Object -ComObject wscript.shell;if($w.AppActivate('Spotify')){Start-Sleep 2;$w.SendKeys('{ENTER}')}"`,
      ];
      for (const cmd of psCmds) {
        const r2 = await tentar(cmd);
        if (r2.ok) { desktopOk = true; break; }
      }
      if (desktopOk) return `🎵 Tocando "${musica}" no Spotify.`;
    }
    // Fallback: tenta pelo Spotify Web (Puppeteer) — perfil persistente agora
    try {
      const msg = await tocarSpotify(musica);
      return msg;
    } catch {
      if (r1.ok) return `🔍 Abri o Spotify procurando "${musica}". Se não tocar, faz login uma vez no Opera da Neon que fica salvo.`;
      return `❌ Não consegui abrir o Spotify para tocar "${musica}".`;
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

  log("INFO", "[ACTION] nenhuma ação reconhecida", { texto });
  return null;
}

module.exports = { executarAcao };