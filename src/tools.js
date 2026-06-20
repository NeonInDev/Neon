const { log } = require("./logger");
const api = require("./api");
const pc = require("./pc");
const { lembrar } = require("./memoria");
const { abrirUrlNoOpera, tocarSpotify, tocarVideoYouTube, pesquisarDuckDuckGo, scrapeTexto, scrapeLinks, scrapeEstrutura, navegarPlaywright, extrairComFallback, tirarScreenshotPlaywright } = require("./browser");
const opencode = require("./opencode");
const ffmpeg = require("./ffmpeg");

const musicQueue = { items: [], current: null, processing: false };

async function processMusicQueue() {
  if (musicQueue.processing || musicQueue.items.length === 0) return;
  musicQueue.processing = true;
  while (musicQueue.items.length > 0) {
    const item = musicQueue.items.shift();
    musicQueue.current = item;
    try {
      if (item.type === "spotify") { await tocarSpotify(item.termo); }
      else if (item.type === "youtube") { await tocarVideoYouTube(item.termo, 0); }
    } catch (err) {
      log("WARN", "[MUSIC] Falha ao tocar", { termo: item.termo, erro: err.message });
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  musicQueue.current = null;
  musicQueue.processing = false;
}

const FERRAMENTAS = [
  { nome: "pesquisar", desc: "Pesquisa algo na web (rápido, Cheerio/DDG). Uso: pesquisar | [consulta]" },
  { nome: "abrir_site", desc: "Abre um site no navegador padrão. Uso: abrir_site | [url]" },
  { nome: "abrir_app", desc: "Abre um app/programa. Uso: abrir_app | [nome]" },
  { nome: "noticias", desc: "Mostra as ultimas noticias. Uso: noticias" },
  { nome: "clima", desc: "Previsao do tempo. Uso: clima | [cidade]" },
  { nome: "cotacao", desc: "Cotacao de moeda/cripto/acao. Uso: cotacao | [BTC/USD/PETR4]" },
  { nome: "pcInfo", desc: "Status do PC (CPU, RAM, Disco). Uso: pcInfo" },
  { nome: "screenshot", desc: "Tira um print da tela. Uso: screenshot" },
  { nome: "volume", desc: "Define o volume (0-100). Uso: volume | [0-100]" },
  { nome: "executar", desc: "Executa comando no terminal. Uso: executar | [comando]" },
  { nome: "lembrar", desc: "Salva algo na memoria. Uso: lembrar | [chave]: [valor] | [categoria] | [prioridade 1-5]" },
  { nome: "tocar_musica", desc: "Toca musica no Spotify. Uso: tocar_musica | [nome]" },
  { nome: "tocar_video", desc: "Toca video no YouTube. Uso: tocar_video | [nome]" },
  { nome: "gerar_imagem", desc: "Gera uma imagem por IA. Uso: gerar_imagem | [prompt]" },
  { nome: "calcular", desc: "Calcula expressao matematica. Uso: calcular | [expressao]" },
  { nome: "falar", desc: "Fala algo em voz alta (TTS). Uso: falar | [texto]" },
  { nome: "ler_arquivo", desc: "Le o conteudo de um arquivo. Uso: ler_arquivo | [caminho]" },
  { nome: "instalar_jogo", desc: "Instala um jogo pela Steam. Uso: instalar_jogo | [nome ou appid]" },
  { nome: "escrever_arquivo", desc: "Escreve conteudo em um arquivo. Uso: escrever_arquivo | [caminho]: [conteudo]" },
  { nome: "click_at", desc: "Clica em coordenada da tela (x y). Uso: click_at | [x] [y]" },
  { nome: "right_click_at", desc: "Clique direito em coordenada (x y). Uso: right_click_at | [x] [y]" },
  { nome: "opencode", desc: "Executa tarefa usando OpenCode. Uso: opencode | [descricao da tarefa]" },
  { nome: "wake_on_lan", desc: "Liga PC remoto via Wake-on-LAN. Uso: wake_on_lan | [mac_address]" },
  { nome: "navegar", desc: "Navega em site com acoes (scroll, clicar, pesquisar). Uso: navegar | [url] > [acao]" },
  { nome: "blender", desc: "Abre o Blender ou executa acoes 3D. Uso: blender | abrir/script/render/export/gerar [descricao]" },
  { nome: "ffmpeg", desc: "Converte/processa midia com FFmpeg. Uso: ffmpeg | [parametros]" },
  { nome: "camera", desc: "Tira foto pela camera do celular (IP Webcam). Uso: camera | snapshot" },
  { nome: "camera_url", desc: "Define URL da camera IP Webcam. Uso: camera_url | [url]" },
  { nome: "modelo3d", desc: "Busca modelos 3D online ou gera via Blender. Uso: modelo3d | buscar [consulta] / gerar [descricao] / primitivo [tipo]" },
  { nome: "spotify_control", desc: "Controla reproducao do Spotify (next/previous/pause/play). Uso: spotify_control | next / previous / pause / play / volume [0-100]" },
  { nome: "youtube_pip", desc: "Coloca video do YouTube em Picture-in-Picture. Uso: youtube_pip" },
  { nome: "youtube_fullscreen", desc: "Coloca video do YouTube em tela cheia. Uso: youtube_fullscreen" },
  { nome: "alarme", desc: "Cria um alarme com som. Uso: alarme | [data/hora] | [mensagem]" },
  { nome: "whatsapp", desc: "Envia mensagem no WhatsApp. Uso: whatsapp | [contato] | [mensagem]" },
  { nome: "email", desc: "Envia email. Uso: email | [destino] | [assunto] | [corpo]" },
  { nome: "calendario", desc: "Lista eventos do Google Calendar. Uso: calendario | hoje / proximos" },
  { nome: "contexto", desc: "Mostra o historico da conversa atual. Uso: contexto" },
  { nome: "fila_status", desc: "Mostra status da fila de tarefas. Uso: fila_status" },
  { nome: "audit", desc: "Mostra logs de auditoria. Uso: audit" },
  // NOVAS TOOLS AUTÔNOMAS
  { nome: "visao", desc: "Analisa a tela do PC com IA (visão computacional). Uso: visao | [o que procurar? opcional]" },
  { nome: "explorar_site", desc: "Navega em um site autonomamente (Playwright headless). Uso: explorar_site | [url] | [objetivo ex: extrair texto / clicar em X] " },
  { nome: "scrape", desc: "Extrai texto de uma URL via Cheerio (rapido, sem browser). Uso: scrape | [url]" },
  { nome: "scrape_links", desc: "Extrai links de uma URL. Uso: scrape_links | [url]" },
  { nome: "clicar_em", desc: "Clica em um elemento na tela descrito em texto (usa visao + mouse). Uso: clicar_em | [descricao do elemento]" },
  { nome: "digitar_em", desc: "Digita texto em um campo descrito em texto (usa visao + teclado). Uso: digitar_em | [descricao do campo] | [texto]" },
  { nome: "tecla", desc: "Pressiona uma tecla (enter, tab, esc, up, down, etc). Uso: tecla | [nome da tecla]" },
  { nome: "achar_janela", desc: "Foca em uma janela pelo titulo. Uso: achar_janela | [titulo ou parte]" },
  { nome: "listar_janelas", desc: "Lista todas as janelas abertas. Uso: listar_janelas" },
  { nome: "fechar_janela", desc: "Fecha uma janela pelo titulo. Uso: fechar_janela | [titulo]" },
  { nome: "mover_mouse", desc: "Move o mouse para coordenada (x y). Uso: mover_mouse | [x] [y]" },
  { nome: "arrastar", desc: "Arrasta o mouse de (x1 y1) ate (x2 y2). Uso: arrastar | [x1] [y1] [x2] [y2]" },
];

function descricaoFerramentas() {
  let lista = FERRAMENTAS.map(f => `- ${f.nome}: ${f.desc}`);
  const extras = getFerramentasPlugin();
  for (const f of extras) lista.push(`- ${f.nome}: ${f.desc}`);
  return lista.join("\n");
}

function getFerramentasPlugin() {
  try { const { getFerramentas } = require("./plugin_loader"); return getFerramentas(); } catch { return []; }
}

function extrairFerramentas(texto) {
  const linhas = texto.split("\n");
  const ferramentas = [];
  for (const linha of linhas) {
    const m = linha.trim().match(/^[*_]{0,2}FERRAMENTA:[*_]{0,2}\s*(\w+)\s*(?:\|\s*(.*))?$/i);
    if (m) ferramentas.push({ nome: m[1].toLowerCase(), args: (m[2] || "").trim() });
  }
  return ferramentas;
}

async function executarFerramenta(ferramenta) {
  const { nome, args } = ferramenta;
  log("INFO", "[TOOLS] Executando ferramenta", { nome, args: args.slice(0, 100) });

  try {
    switch (nome) {
      case "pesquisar": {
        if (!args) return "Nada para pesquisar.";
        const resultados = await pesquisarDuckDuckGo(args);
        if (resultados.length === 0) return `Nenhum resultado para "${args}".`;
        return resultados.map((r, i) => `${i + 1}. ${r.titulo}\n   ${r.url}`).join("\n");
      }

      case "abrir_site": {
        if (!args) return "Nada para abrir.";
        let url = args;
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        await abrirUrlNoOpera(url);
        return `✅ Abri ${url} no seu navegador.`;
      }

      case "abrir_app": {
        try {
          const { executarAcao } = require("./actions");
          return await executarAcao(args, "app");
        } catch { return `❌ App "${args}" não encontrado.`; }
      }

      case "noticias": return await api.noticias();
      case "clima": return args ? await api.clima(args) : await api.clima();
      case "cotacao": return await api.cotacao(args);
      case "pcInfo": return await pc.pcInfo();

      case "screenshot": {
        const caminho = await pc.screenshot();
        return `📸 Print salvo em: ${caminho}`;
      }

      case "volume": {
        const v = parseInt(args);
        if (isNaN(v)) return "❌ Use: volume | [0-100]";
        return await pc.volume("set", v);
      }

      case "executar": {
        if (!args) return "Nada para executar.";
        const { promisify } = require("util");
        const { exec } = require("child_process");
        const execAsync = promisify(exec);
        const { stdout, stderr } = await execAsync(args, { timeout: 60000, windowsHide: true });
        return (stdout || stderr || "(sem saída)").slice(0, 1500);
      }

      case "lembrar": {
        const partes = args.split("|").map(s => s.trim());
        const chaveValor = partes[0] || "";
        const m = chaveValor.match(/^(.+?):\s*(.+)$/);
        if (!m) return "❌ Formato: lembrar | [chave]: [valor] | [categoria] | [prioridade]";
        const chave = m[1].trim(), valor = m[2].trim();
        const categoria = partes[1] || "geral";
        const prioridade = parseInt(partes[2]) || 3;
        await lembrar(chave, valor, categoria, prioridade);
        return `✅ Lembrei: ${chave} = ${valor.slice(0, 100)}`;
      }

      case "tocar_musica": {
        if (!args) return "Nada para tocar.";
        musicQueue.items.push({ type: "spotify", termo: args });
        processMusicQueue();
        return `🎵 Adicionei "${args}" à fila do Spotify.`;
      }

      case "tocar_video": {
        if (!args) return "Nada para tocar.";
        musicQueue.items.push({ type: "youtube", termo: args });
        processMusicQueue();
        return `🎬 Adicionei "${args}" à fila do YouTube.`;
      }

      case "gerar_imagem": {
        if (!args) return "❌ Descreva a imagem.";
        try {
          const { gerarImagem } = require("./api");
          const url = await gerarImagem(args);
          return url ? `✅ Imagem gerada: ${url}` : "❌ Falha ao gerar imagem.";
        } catch (err) { return `❌ Erro: ${err.message}`; }
      }

      case "calcular": {
        if (!args) return "❌ Nada para calcular.";
        try {
          const resultado = Function(`"use strict"; return (${args})`)();
          return `🧮 ${args} = ${resultado}`;
        } catch { return `❌ Expressão inválida: ${args}`; }
      }

      case "falar": return args ? await pc.tts(args) : "❌ Nada para falar.";

      case "ler_arquivo": {
        if (!args) return "❌ Caminho obrigatório.";
        const fs = require("fs");
        if (!fs.existsSync(args)) return `❌ Arquivo não encontrado: ${args}`;
        return fs.readFileSync(args, "utf8").slice(0, 2000);
      }

      case "instalar_jogo": {
        if (!args) return "❌ Nome do jogo obrigatório.";
        const appId = args.match(/^\d+$/) ? args : "";
        if (appId) { const { exec } = require("child_process"); exec(`start steam://install/${appId}`); return `🎮 Instalando app ${appId} pela Steam.`; }
        const { exec } = require("child_process");
        exec(`start steam://install/${args.replace(/\s+/g, "")}`);
        return `🎮 Instalando "${args}" pela Steam.`;
      }

      case "escrever_arquivo": {
        const partes = args.split("|").map(s => s.trim());
        const caminho = partes[0];
        const conteudo = partes.slice(1).join("|") || "";
        if (!caminho) return "❌ Caminho obrigatório.";
        require("fs").writeFileSync(caminho, conteudo, "utf8");
        return `✅ Arquivo salvo: ${caminho}`;
      }

      case "click_at": {
        const [xs, ys] = args.split(/\s+/);
        const x = parseInt(xs), y = parseInt(ys);
        if (isNaN(x) || isNaN(y)) return "❌ Use: click_at | [x] [y]";
        await pc.clicarMouse(x, y);
        return `🖱️ Cliquei em (${x}, ${y}).`;
      }

      case "right_click_at": {
        const [xs, ys] = args.split(/\s+/);
        const x = parseInt(xs), y = parseInt(ys);
        if (isNaN(x) || isNaN(y)) return "❌ Use: right_click_at | [x] [y]";
        await pc.clicarMouse(x, y, "right");
        return `🖱️ Clique direito em (${x}, ${y}).`;
      }

      case "opencode": {
        if (!args) return "❌ Descreva a tarefa.";
        return await opencode.executar(args);
      }

      case "wake_on_lan": {
        if (!args) return "❌ MAC address obrigatório.";
        const dgram = require("dgram");
        const mac = args.replace(/[^a-fA-F0-9]/g, "");
        if (mac.length !== 12) return "❌ MAC inválido (ex: AA:BB:CC:DD:EE:FF)";
        const buf = Buffer.alloc(102);
        for (let i = 0; i < 6; i++) buf[i] = 0xFF;
        const macBytes = Buffer.from(mac, "hex");
        for (let i = 1; i <= 16; i++) macBytes.copy(buf, i * 6);
        const sock = dgram.createSocket("udp4");
        sock.send(buf, 0, buf.length, 9, "255.255.255.255");
        sock.close();
        return `✅ Magic packet enviado para ${args}`;
      }

      case "navegar": {
        const [urlPart, ...acaoParts] = args.split(">").map(s => s.trim());
        if (!urlPart) return "❌ Use: navegar | [url] > [acao]";
        let url = urlPart;
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        const acaoTexto = acaoParts.join(" > ");
        const { executarRoteiro, interpretarAcaoTexto, abrirPagina, executarAcao, fecharAba } = require("./browser");
        if (!acaoTexto) {
          await abrirUrlNoOpera(url);
          return `✅ Abri ${url} no navegador.`;
        }
        const acao = await interpretarAcaoTexto(acaoTexto);
        if (!acao) return `✅ Abri ${url}, mas não entendi a ação "${acaoTexto}".`;

        try {
          const page = await abrirPagina(url);
          await executarAcao(page, acao);
          let desc = "";
          if (acao.tipo === "pesquisar") desc = `pesquisei "${acao.termo}"`;
          else if (acao.tipo === "clicar") desc = `cliquei em "${acao.texto}"`;
          else if (acao.tipo === "digitar") desc = `digitei "${acao.texto}"`;
          else if (acao.tipo === "extrair") desc = `extraí:\n${acao.textoExtraido?.slice(0, 1000) || "(vazio)"}`;
          else if (acao.tipo === "pip") desc = `ativei PiP`;
          else desc = `executei ação`;
          await fecharAba(page);
          return `✅ Naveguei em ${url} e ${desc}`;
        } catch (err) {
          return `✅ Abri ${url}, mas a ação falhou: ${err.message}`;
        }
      }

      case "blender": {
        const blender = require("./blender");
        const partes = args.split("|").map(s => s.trim());
        const cmd = partes[0]?.toLowerCase() || "";
        if (!cmd || cmd === "abrir") return await blender.abrir();
        if (cmd === "script") return await blender.executarScript(partes[1]);
        if (cmd === "render") return await blender.renderizar(partes[1], parseInt(partes[2]) || 1);
        if (cmd === "export") return await blender.exportar(partes[1], partes[2] || "obj");
        if (cmd === "gerar") return await blender.gerarComAutonomia(partes.slice(1).join(" | "));
        return await blender.executarComando(args);
      }

      case "ffmpeg": return args ? await ffmpeg.executar(args) : "❌ Parâmetros obrigatórios.";

      case "camera": {
        const { tirarFoto } = require("./camera");
        return await tirarFoto();
      }

      case "camera_url": {
        if (!args) return "❌ URL obrigatória.";
        const { config } = require("./config");
        config.cameraUrl = args;
        return `✅ URL da câmera definida: ${args}`;
      }

      case "modelo3d": {
        const modelo3d = require("./modelos3d");
        const partes = args.split("|").map(s => s.trim());
        const cmd = partes[0]?.toLowerCase() || "";
        if (cmd === "buscar") return await modelo3d.buscarModelo(partes[1]);
        if (cmd === "gerar") return await modelo3d.gerarModelo(partes[1]);
        if (cmd === "primitivo") return await modelo3d.criarPrimitivo(partes[1]);
        return "❌ Use: modelo3d | buscar/gerar/primitivo | [descricao]";
      }

      case "spotify_control": {
        const cmd = args?.toLowerCase().trim() || "";
        if (cmd === "next") { require("./sendkey").send(0xB0); return "⏭️ Próxima música."; }
        if (cmd === "previous") { require("./sendkey").send(0xB1); return "⏮️ Música anterior."; }
        if (cmd === "pause") { const sendkey = require("./sendkey"); sendkey.spotify("pause"); return "⏸️ Spotify pausado."; }
        if (cmd === "play") { const sendkey = require("./sendkey"); sendkey.spotify("play"); return "▶️ Spotify retomado."; }
        const vm = cmd.match(/volume\s*(\d+)/);
        if (vm) { const v = parseInt(vm[1]); return await pc.volume("set", v); }
        return "❌ Use: next / previous / pause / play / volume [0-100]";
      }

      case "youtube_pip": {
        const sendkey = require("./sendkey");
        try {
          const navs = ["Chrome", "Edge", "Opera", "Firefox", "MsEdge", "brave", "Vivaldi"];
          for (const n of navs) { try { sendkey.sendKey(n, "i".charCodeAt(0), true); return "📺 PiP ativado."; } catch {} }
          return "❌ Não consegui ativar PiP.";
        } catch { return "❌ Erro ao ativar PiP."; }
      }

      case "youtube_fullscreen": {
        const sendkey = require("./sendkey");
        try {
          const navs = ["Chrome", "Edge", "Opera", "Firefox", "MsEdge", "brave", "Vivaldi"];
          for (const n of navs) { try { sendkey.sendKey(n, 0x0F, false); return "🖥️ Tela cheia ativada."; } catch {} }
          return "❌ Não consegui ativar tela cheia.";
        } catch { return "❌ Erro ao ativar tela cheia."; }
      }

      case "alarme": {
        const partes = args.split("|").map(s => s.trim());
        const dataHora = partes[0], mensagem = partes[1] || "Alarme!";
        if (!dataHora) return "❌ Data/hora obrigatória.";
        const { criarAlarme } = require("./lembrete_alarme");
        await criarAlarme(dataHora, mensagem);
        return `⏰ Alarme criado para ${dataHora}: "${mensagem}"`;
      }

      case "whatsapp": {
        const partes = args.split("|").map(s => s.trim());
        const contato = partes[0], mensagem = partes[1];
        if (!contato || !mensagem) return "❌ Use: whatsapp | [contato] | [mensagem]";
        try {
          const whatsapp = require("./whatsapp");
          await whatsapp.enviar(contato, mensagem);
          return `✅ WhatsApp enviado para ${contato}.`;
        } catch (err) { return `❌ Erro WhatsApp: ${err.message}`; }
      }

      case "email": {
        const partes = args.split("|").map(s => s.trim());
        const destino = partes[0], assunto = partes[1], corpo = partes[2];
        if (!destino || !assunto || !corpo) return "❌ Use: email | [destino] | [assunto] | [corpo]";
        return await pc.enviarEmail(destino, assunto, corpo);
      }

      case "calendario": {
        const calendario = require("./calendario");
        if (args === "hoje") return await calendario.listarEventos(new Date());
        if (args === "proximos") return await calendario.listarProximos();
        return await calendario.listarEventos();
      }

      case "contexto": {
        const ctx = require("./contexto");
        const txt = ctx.formatarParaPrompt();
        return txt ? `📋 Contexto:\n${txt}` : "📋 Nenhum contexto recente.";
      }

      case "fila_status": {
        const mq = musicQueue;
        const status = [`📊 Fila de música: ${mq.items.length} item(ns)`];
        if (mq.current) status.push(`   Tocando agora: ${mq.current.termo}`);
        return status.join("\n");
      }

      case "audit": {
        try {
          const permissoes = require("./permissions");
          const logs = permissoes.ultimos(10);
          return logs.length ? logs.join("\n") : "📋 Nenhum log de auditoria.";
        } catch { return "📋 Módulo de auditoria não disponível."; }
      }

      // ===== NOVAS TOOLS AUTÔNOMAS =====

      case "visao": {
        const resultado = await pc.verTela(args || "");
        if (resultado.erro) return `❌ Visão: ${resultado.erro}`;
        return `👁️ Análise da tela:\n${resultado.descricao}`;
      }

      case "explorar_site": {
        if (!args) return "❌ Use: explorar_site | [url] | [objetivo]";
        const [urlStr, objetivo] = args.split("|").map(s => s.trim());
        let url = urlStr;
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        const acoes = [];
        if (objetivo?.toLowerCase().includes("extrair") || objetivo?.toLowerCase().includes("texto")) acoes.push({ tipo: "extrair" });
        else if (objetivo?.toLowerCase().includes("clicar")) acoes.push({ tipo: "clicar", texto: objetivo.replace(/clicar\s+(?:em\s+)?/i, "").trim() });
        else acoes.push({ tipo: "extrair" });
        try {
          const res = await navegarPlaywright(url, acoes);
          const texto = res.find(r => r.tipo === "texto")?.dados || "(vazio)";
          if (texto.length < 100) {
            const rota2 = await navegarPlaywright(url, [{ tipo: "extrair" }]);
            const texto2 = rota2.find(r => r.tipo === "texto")?.dados || texto;
            return `🌐 ${url}:\n${texto2.slice(0, 3000)}`;
          }
          return `🌐 ${url}:\n${texto.slice(0, 3000)}`;
        } catch (err) {
          return `❌ Erro ao explorar ${url}: ${err.message}`;
        }
      }

      case "scrape": {
        if (!args) return "❌ URL obrigatória.";
        let url = args;
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        try {
          const texto = await extrairComFallback(url);
          return `📄 ${url}:\n${texto.slice(0, 3000)}`;
        } catch (err) {
          return `❌ Erro ao extrair ${url}: ${err.message}`;
        }
      }

      case "scrape_links": {
        if (!args) return "❌ URL obrigatória.";
        let url = args;
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        try {
          const links = await scrapeLinks(url);
          if (links.length === 0) return `Nenhum link encontrado em ${url}.`;
          return `🔗 Links em ${url}:\n${links.map((l, i) => `${i + 1}. ${l.texto}\n   ${l.href}`).join("\n")}`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }

      case "clicar_em": {
        if (!args) return "❌ Descreva onde clicar.";
        const visao = await pc.verTela(`Onde está "${args}" na tela? Dê as coordenadas aproximadas (x, y) do centro do elemento.`);
        if (visao.erro) return `❌ Não consegui ver a tela: ${visao.erro}`;
        return `👁️ Analisei a tela. Descrição:\n${visao.descricao}\n\nPara clicar preciso de coordenadas exatas. Use click_at se souber as coordenadas, ou me diga o que mais você vê na tela.`;
      }

      case "digitar_em": {
        const [campo, texto] = args.split("|").map(s => s.trim());
        if (!campo || !texto) return "❌ Use: digitar_em | [descricao do campo] | [texto]";
        const visao = await pc.verTela(`Onde está o campo "${campo}" na tela?`);
        if (visao.erro) return `❌ ${visao.erro}`;
        return `👁️ Analisei a tela. Descrição:\n${visao.descricao}\n\nPra digitar preciso de coordenadas. Use click_at para clicar no campo e depois use tecla | ctrl_a + tecla | backspace + executar um script ou algo para digitar.`;
      }

      case "tecla": {
        if (!args) return "❌ Tecla obrigatória (enter, tab, esc, up, down, etc).";
        const tecla = args.trim().toLowerCase();
        const mapa = {
          "enter": "enter", "tab": "tab", "esc": "esc", "escape": "esc",
          "up": "up", "down": "down", "left": "left", "right": "right",
          "espaço": "space", "space": "space", "espaco": "space",
          "backspace": "backspace", "delete": "delete", "del": "delete",
          "home": "home", "end": "end",
          "f5": "f5", "f11": "f11",
          "ctrl+c": "ctrl_c", "ctrl+v": "ctrl_v", "ctrl+x": "ctrl_x",
          "ctrl+z": "ctrl_z", "ctrl+s": "ctrl_s", "ctrl+a": "ctrl_a",
          "alt+tab": "alt_tab",
        };
        const cmd = mapa[tecla] || tecla;
        await pc.tecla(cmd);
        return `⌨️ Tecla "${tecla}" pressionada.`;
      }

      case "achar_janela": {
        if (!args) return "❌ Título da janela obrigatório.";
        const res = await pc.acharJanela(args);
        if (res === "nao_encontrado") return `❌ Janela "${args}" não encontrada.`;
        return `✅ ${res}`;
      }

      case "listar_janelas": {
        const res = await pc.listarJanelas();
        return res ? `🪟 Janelas:\n${res}` : "Nenhuma janela encontrada.";
      }

      case "fechar_janela": {
        if (!args) return "❌ Título da janela obrigatório.";
        const res = await pc.fecharJanela(args);
        if (res === "nao_encontrado") return `❌ Janela "${args}" não encontrada.`;
        return `✅ Janela "${args}" fechada.`;
      }

      case "mover_mouse": {
        const [xs, ys] = args.split(/\s+/);
        const x = parseInt(xs), y = parseInt(ys);
        if (isNaN(x) || isNaN(y)) return "❌ Use: mover_mouse | [x] [y]";
        await pc.moverMouse(x, y);
        return `🖱️ Mouse movido para (${x}, ${y}).`;
      }

      case "arrastar": {
        const coords = args.split(/\s+/).map(Number);
        if (coords.length < 4 || coords.some(isNaN)) return "❌ Use: arrastar | [x1] [y1] [x2] [y2]";
        await pc.arrastar(coords[0], coords[1], coords[2], coords[3]);
        return `🖱️ Arrastei de (${coords[0]}, ${coords[1]}) para (${coords[2]}, ${coords[3]}).`;
      }

      default: {
        const extras = getFerramentasPlugin();
        const pluginTool = extras.find(f => f.nome === nome);
        if (pluginTool) return await pluginTool.exec(args);
        return `❌ Ferramenta "${nome}" desconhecida.`;
      }
    }
  } catch (err) {
    log("WARN", "[TOOLS] Erro na ferramenta", { nome, erro: err.message });
    return `❌ Erro ao executar "${nome}": ${err.message}`;
  }
}

async function processarResposta(texto) {
  const ferramentas = extrairFerramentas(texto);
  if (!ferramentas.length) return { texto, acoes: [] };
  const resultados = [];
  for (const f of ferramentas) {
    const res = await executarFerramenta(f);
    resultados.push({ ferramenta: f, resultado: res });
  }
  return { texto, acoes: resultados };
}

module.exports = { executarFerramenta, processarResposta, descricaoFerramentas, extrairFerramentas, FERRAMENTAS };
