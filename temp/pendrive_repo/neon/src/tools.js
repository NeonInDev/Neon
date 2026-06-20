const { log } = require("./logger");
const api = require("./api");
const pc = require("./pc");
const { lembrar } = require("./memoria");
const { abrirUrlNoOpera, tocarSpotify, tocarVideoYouTube } = require("./browser");
const axios = require("axios");
const ffmpeg = require("./ffmpeg");

const FERRAMENTAS = [
  { nome: "pesquisar", desc: "Pesquisa algo na web. Uso: pesquisar | [consulta]" },
  { nome: "abrir_site", desc: "Abre um site no Opera. Uso: abrir_site | [url]" },
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
  { nome: "click_at", desc: "Clica em coordenada da tela. Uso: click_at | [x] [y]" },
  { nome: "right_click_at", desc: "Clique direito em coordenada. Uso: right_click_at | [x] [y]" },
  { nome: "opencode", desc: "Executa tarefa usando OpenCode. Uso: opencode | [descricao da tarefa]" },
  { nome: "wake_on_lan", desc: "Liga PC remoto via Wake-on-LAN. Uso: wake_on_lan | [mac_address]" },
  { nome: "navegar", desc: "Navega em site com acoes (scroll, clicar, pesquisar). Uso: navegar | [url] > [acao]" },
  { nome: "blender", desc: "Abre o Blender 3D ou executa acoes. Uso: blender | [caminho] / render [arquivo] | [frame] / export [arquivo] | [formato] / script [descricao]" },
  { nome: "ffmpeg", desc: "Converte/processa midia com FFmpeg. Uso: ffmpeg | [parametros]" },
  { nome: "camera", desc: "Tira foto pela camera do celular (IP Webcam). Uso: camera | snapshot" },
  { nome: "camera_url", desc: "Define URL da camera IP Webcam. Uso: camera_url | [url]" },
  { nome: "modelo3d", desc: "Busca modelos 3D online ou gera via Blender. Uso: modelo3d | buscar [consulta] / gerar [descricao] / primitivo [tipo]" },
  { nome: "spotify_control", desc: "Controla reproducao do Spotify. Uso: spotify_control | next / previous / pause / play / volume [0-100]" },
  { nome: "youtube_pip", desc: "Coloca video do YouTube em Picture-in-Picture. Uso: youtube_pip" },
  { nome: "youtube_fullscreen", desc: "Coloca video do YouTube em tela cheia. Uso: youtube_fullscreen" },
  { nome: "clima_tempo", desc: "Previsao do tempo com detalhes. Uso: clima_tempo | [cidade]" },
  { nome: "alarme", desc: "Cria um alarme com som. Uso: alarme | [data/hora] | [mensagem]" },
  { nome: "whatsapp", desc: "Envia mensagem no WhatsApp. Uso: whatsapp | [contato] | [mensagem]" },
  { nome: "email", desc: "Envia email. Uso: email | [destino] | [assunto] | [corpo]" },
  { nome: "calendario", desc: "Lista eventos do Google Calendar. Uso: calendario | hoje / proximos" },
  { nome: "contexto", desc: "Mostra o historico da conversa atual. Uso: contexto" },
  { nome: "fila_status", desc: "Mostra status da fila de tarefas. Uso: fila_status" },
  { nome: "audit", desc: "Mostra logs de auditoria. Uso: audit" },
];

function descricaoFerramentas() {
  let lista = FERRAMENTAS.map(f => `- ${f.nome}: ${f.desc}`)
  const extras = getFerramentasPlugin()
  for (const f of extras) {
    lista.push(`- ${f.nome}: ${f.desc}`)
  }
  return lista.join("\n")
}

function getFerramentasPlugin() {
  try {
    const { getFerramentas } = require("./plugin_loader")
    return getFerramentas()
  } catch { return [] }
}

function extrairFerramentas(texto) {
  const linhas = texto.split("\n");
  const ferramentas = [];
  for (const linha of linhas) {
    const m = linha.trim().match(/^FERRAMENTA:\s*(\w+)\s*(?:\|\s*(.*))?$/i);
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
        let resultados = [];
        try {
          const { data } = await axios.get(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(args)}`, { timeout: 10000 });
          const linhas = data.split("\n").filter(l => l.includes('class="result-snippet"') || l.includes('class="result-link"') || l.includes('class="result-title"'));
          const snippets = data.match(/<a[^>]+class="result-link"[^>]*>(.*?)<\/a>|<a[^>]+class="result-title"[^>]*>(.*?)<\/a>|<td[^>]+class="result-snippet"[^>]*>(.*?)<\/td>/gi) || [];
          const texto = snippets.map(s => s.replace(/<[^>]+>/g, "").trim()).filter(Boolean).slice(0, 6);
          if (texto.length) resultados = texto;
        } catch {}
        const url = `https://www.google.com/search?q=${encodeURIComponent(args)}`;
        await abrirUrlNoOpera(url);
        const resumo = resultados.length ? resultados.join("\n") : `Abri o Google com resultados para "${args}".`;
        return `Resultados da pesquisa "${args}":\n${resumo}`;
      }
      case "abrir_site": {
        let url = args;
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        await abrirUrlNoOpera(url);
        return `Abri o site: ${url}`;
      }
      case "navegar": {
        if (!args) return "Uso: navegar | [url] > [acoes]";
        const { abrirPagina, interpretarAcaoTexto, executarAcao } = require("./browser");
        const partes = args.split(">").map(s => s.trim());
        let url = partes[0];
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        const acoes = partes.slice(1).filter(Boolean);
        const page = await abrirPagina(url);
        const resultados = [];
        try {
          for (const acaoTexto of acoes) {
            const acao = await interpretarAcaoTexto(acaoTexto);
            if (!acao) { resultados.push(`Acao ignorada: "${acaoTexto}"`); continue; }
            if (acao.tipo === "scrollar") {
              if (acao.quantidade === -99999) await page.evaluate(() => window.scrollTo(0, 0));
              else if (acao.quantidade === 99999) await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
              else await page.evaluate((q) => window.scrollBy(0, q), acao.quantidade);
              resultados.push(`Scroll ${acao.quantidade === -99999 ? "topo" : acao.quantidade === 99999 ? "fim" : acao.quantidade + "px"}`);
            } else if (acao.tipo === "clicar") {
              const els = await page.$$("a, button, [role='button'], [onclick], img, video, [class*='title'], [class*='video'], [id*='video'], ytd-video-renderer, ytmusic-responsive-list-item-renderer");
              let found = false;
              for (const el of els) {
                const txt = await el.evaluate(e => (e.textContent || "").trim().toLowerCase());
                const alt = await el.evaluate(e => (e.alt || "").trim().toLowerCase());
                const title = await el.evaluate(e => (e.title || "").trim().toLowerCase());
                if (txt.includes(acao.texto.toLowerCase()) || alt.includes(acao.texto.toLowerCase()) || title.includes(acao.texto.toLowerCase())) {
                  await el.evaluate(e => e.scrollIntoView({ behavior: "smooth", block: "center" }));
                  await new Promise(r => setTimeout(r, 500));
                  await el.click();
                  resultados.push(`Cliquei em "${acao.texto}"`);
                  found = true;
                  break;
                }
              }
              if (!found) {
                try {
                  const [el] = await page.$x(`//*[contains(text(), "${acao.texto}")]`);
                  if (el) { await el.click(); resultados.push(`Cliquei em "${acao.texto}" (XPath)`); found = true; }
                } catch {}
              }
              if (!found) resultados.push(`Nao achei "${acao.texto}" na pagina`);
            } else if (acao.tipo === "pesquisar") {
              const sel = "input[type='text'], input[name='q'], input[type='search'], textarea, input[role='combobox'], input[aria-label*='Pesquisar'], input[aria-label*='Search']";
              const input = await page.$(sel);
              if (input) {
                await input.click({ clickCount: 3 });
                await input.type(acao.termo, { delay: 50 });
                await page.keyboard.press("Enter");
                await new Promise(r => setTimeout(r, 3000));
                resultados.push(`Pesquisei "${acao.termo}"`);
              } else resultados.push("Campo de busca nao encontrado");
            } else if (acao.tipo === "extrair") {
              const bodyText = await page.evaluate(() => document.body.textContent.trim().slice(0, 2000));
              resultados.push(`Texto: ${bodyText}`);
            } else if (acao.tipo === "esperar") {
              await new Promise(r => setTimeout(r, acao.tempo || 2000));
              resultados.push(`Esperei ${(acao.tempo || 2000) / 1000}s`);
            } else if (acao.tipo === "digitar") {
              const sel = "input:not([type='hidden']), textarea, [contenteditable='true']";
              const input = await page.$(sel);
              if (input) { await input.type(acao.texto, { delay: 30 }); resultados.push(`Digitei "${acao.texto}"`); }
              else resultados.push("Campo de texto nao encontrado");
            } else {
              await executarAcao(page, acao);
              resultados.push(`Acao "${acao.tipo}" executada`);
            }
          }
        } catch (err) {
          resultados.push(`Erro: ${err.message.slice(0, 100)}`);
        }
        await page.close().catch(() => {});
        return `Naveguei em ${url}:\n${resultados.join("\n")}`;
      }
      case "abrir_app": {
        if (!args) return "Nada pra abrir.";
        const { executarAcao } = require("./actions");
        const resultado = await executarAcao("abrir " + args, true, "1442928336329379925");
        return resultado?.replace(/[*_`~|#]/g, "") || `Tentei abrir ${args}`;
      }
      case "noticias": {
        const lista = await api.noticias();
        return "Ultimas noticias:\n" + lista.slice(0, 5).map((n, i) => `${i + 1}. ${n.titulo}${n.url ? ` (${n.url})` : ""}`).join("\n");
      }
      case "clima": {
        const cidade = args || "São Paulo";
        const c = await api.clima(cidade);
        return `Clima em ${c.cidade}: ${c.condicao}, ${c.temperatura}, umidade ${c.umidade || "N/A"}`;
      }
      case "cotacao": {
        const alvo = args?.toUpperCase() || "BTC";
        if (["BTC", "ETH", "SOL"].includes(alvo)) {
          const c = await api.cotacaoCrypto(alvo);
          return `${alvo}: $${c.preco} (${c.variacao24h >= 0 ? "+" : ""}${c.variacao24h?.toFixed(2)}%)`;
        }
        if (alvo.length <= 5) {
          const c = await api.cotacaoMoeda(alvo);
          return `${c.codigo || alvo}: R$ ${c.preco}`;
        }
        const s = await api.cotacaoAcao(alvo);
        return `${s.nome || alvo}: R$ ${s.preco} (${s.variacao >= 0 ? "+" : ""}${s.variacao?.toFixed(2)}%)`;
      }
      case "pcinfo": {
        return await pc.pcInfo();
      }
      case "screenshot": {
        const { executarAcao } = require("./actions");
        const r = await executarAcao("tira um print", true, "1442928336329379925");
        return r || "Print tirado.";
      }
      case "volume": {
        const nivel = parseInt(args) || 50;
        const { executarAcao } = require("./actions");
        return await executarAcao(`volume ${nivel}`, true, "1442928336329379925");
      }
      case "executar": {
        if (!args) return "Nada pra executar.";
        const { exec: execCb } = require("child_process");
        const { promisify } = require("util");
        const execAsync = promisify(execCb);
        const { stdout, stderr } = await execAsync(args, { timeout: 10000, windowsHide: true });
        return (stdout?.trim() || stderr?.trim() || "Comando executado.").slice(0, 500);
      }
      case "lembrar": {
        if (!args) return "Nada pra lembrar.";
        const pipes = args.split("|").map(s => s.trim())
        const chaveValor = pipes[0]
        const doisP = chaveValor.indexOf(":");
        let chave, valor, categoria = "outro", prioridade = 3
        if (doisP > 0) {
          chave = chaveValor.slice(0, doisP).trim()
          valor = chaveValor.slice(doisP + 1).trim()
        } else {
          chave = "info"
          valor = chaveValor
        }
        if (pipes[1]) categoria = pipes[1]
        if (pipes[2]) prioridade = parseInt(pipes[2]) || 3
        return await lembrar(chave, valor, categoria, prioridade);
      }
      case "tocar_musica": {
        if (!args) return "Nada pra tocar.";
        await tocarSpotify(args);
        return `Tocando "${args}" no Spotify`;
      }
      case "tocar_video": {
        if (!args) return "Nada pra tocar.";
        const skip = Math.floor(Math.random() * 3);
        await tocarVideoYouTube(args, skip);
        return `Tocando "${args}" no YouTube`;
      }
      case "gerar_imagem": {
        if (!args) return "Nada pra gerar.";
        const url = api.gerarImagem(args);
        return `Imagem gerada: ${url}`;
      }
      case "calcular": {
        if (!args) return "Nada pra calcular.";
        try {
          const expr = args.replace(/x/g, "*").replace(/,/g, ".").replace(/(\d+)\s*por cento\s+(?:de|do|da)?\s*/g, "($1/100)*");
          const result = Function(`"use strict"; return (${expr})`)();
          return `${args} = ${Number.isInteger(result) ? result : result.toFixed(4)}`;
        } catch {
          return "Erro ao calcular.";
        }
      }
      case "ler_arquivo": {
        if (!args) return "Nada pra ler.";
        const fs = require("fs");
        if (!fs.existsSync(args)) return `Arquivo nao encontrado: ${args}`;
        const stat = fs.statSync(args);
        if (stat.size > 100 * 1024) return "Arquivo muito grande (max 100KB) pra exibir aqui.";
        const conteudo = fs.readFileSync(args, "utf8");
        return `Conteudo de ${args}:\n\`\`\`\n${conteudo.slice(0, 1500)}\n\`\`\``;
      }
      case "instalar_jogo": {
        if (!args) return "Nada pra instalar.";
        const { steamGames } = require("./actions");
        const nome = args.toLowerCase().trim();
        let appid = null;
        if (/^\d+$/.test(nome)) {
          appid = parseInt(nome);
        } else {
          appid = steamGames[nome];
          if (!appid) {
            for (const [key, val] of Object.entries(steamGames)) {
              if (nome.includes(key) || key.includes(nome)) { appid = val; break; }
            }
          }
        }
        if (!appid) return `Nao encontrei o jogo "${args}" na minha lista.`;
        const { exec: execCb } = require("child_process");
        const { promisify } = require("util");
        const execAsync = promisify(execCb);
        await execAsync(`start steam://install/${appid}`, { windowsHide: true });
        return `Instalando ${args} pela Steam (AppID: ${appid}).`;
      }
      case "escrever_arquivo": {
        if (!args) return "Nada pra escrever.";
        const fs = require("fs");
        const path = require("path");
        const doisP = args.indexOf("]:");
        if (doisP < 0) return "Formato: caminho]: conteudo (ex: C:\\pasta\\file.txt]: hello)";
        const caminho = args.slice(0, doisP).replace(/^\[/, "").trim();
        const conteudo = args.slice(doisP + 2).trim();
        const dir = path.dirname(caminho);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(caminho, conteudo, "utf8");
        return `Arquivo salvo: ${caminho}`;
      }
      case "click_at":
      case "right_click_at": {
        if (!args) return "Uso: [x] [y]";
        const [x, y] = args.trim().split(/\s+/).map(Number);
        if (isNaN(x) || isNaN(y)) return "Coordenadas invalidas. Use: x y";
        const isRight = nome === "right_click_at";
        const { exec: execCb } = require("child_process");
        const { promisify } = require("util");
        const execAsync = promisify(execCb);
        const psCmd = `Add-Type -AssemblyName System.Windows.Forms; ` +
          `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y}); ` +
          `Start-Sleep -Milliseconds 100; ` +
          `[System.Windows.Forms.Application]::DoEvents(); ` +
          `$sig = '[DllImport("user32.dll")]public static extern void mouse_event(int f, int a, int b, int c, int d);'; ` +
          `$type = Add-Type -MemberDefinition $sig -Name Mouse -Namespace W -PassThru; ` +
          `$type::mouse_event(${isRight ? 0x08 : 0x02}, 0, 0, 0, 0); ` +
          `Start-Sleep -Milliseconds 50; ` +
          `$type::mouse_event(${isRight ? 0x10 : 0x04}, 0, 0, 0, 0)`;
        await execAsync(`powershell -NoProfile -Command "${psCmd.replace(/"/g, '\\"')}"`, { timeout: 10000, windowsHide: true });
        return `Clique ${isRight ? "direito" : ""} em (${x}, ${y})`;
      }
      case "opencode": {
        if (!args) return "Nada pra executar no OpenCode.";
        const { exec: execCb } = require("child_process");
        const { promisify } = require("util");
        const execAsync = promisify(execCb);
        const { stdout, stderr } = await execAsync(`opencode run "${args.replace(/"/g, '\\"')}"`, { timeout: 60000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
        return (stdout?.trim() || stderr?.trim() || "OpenCode executado.").slice(0, 1000);
      }
      case "wake_on_lan": {
        if (!args) return "MAC address necessario. Uso: XX:XX:XX:XX:XX:XX";
        const dgram = require("dgram");
        const mac = args.replace(/[^0-9a-fA-F]/g, "");
        if (mac.length !== 12) return "MAC invalido. Use formato XX:XX:XX:XX:XX:XX";
        const magic = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, ...Buffer.from(mac.repeat(16), "hex")]);
        const sock = dgram.createSocket("udp4");
        sock.send(magic, 0, magic.length, 9, "255.255.255.255");
        sock.send(magic, 0, magic.length, 9, "192.168.1.255");
        sock.close();
        return `Pacote magico enviado para ${args}. PC deve ligar se Wake-on-LAN estiver ativo.`;
      }
      case "blender": {
        const blender = require("./blender");
        if (!args) {
          const r = await blender.abrir();
          return r.ok ? r.msg : r.msg;
        }
        const lower = args.trim().toLowerCase();
        if (lower.startsWith("render ")) {
          const partes = args.slice(7).split("|").map(s => s.trim());
          const arquivo = partes[0];
          const frame = parseInt(partes[1]) || 1;
          if (!require("fs").existsSync(arquivo)) return `Arquivo não encontrado: ${arquivo}`;
          const r = await blender.renderizar(arquivo, frame);
          return r.ok ? `✅ ${r.msg}` : r.msg;
        }
        if (lower.startsWith("export ")) {
          const partes = args.slice(7).split("|").map(s => s.trim());
          const arquivo = partes[0];
          const formato = partes[1] || "obj";
          if (!require("fs").existsSync(arquivo)) return `Arquivo não encontrado: ${arquivo}`;
          const r = await blender.exportar(arquivo, formato);
          return r.ok ? `✅ ${r.msg}` : r.msg;
        }
        if (lower.startsWith("script ")) {
          const descricao = args.slice(7).trim();
          const { gerarBlenderScript } = require("./opencode");
          const scriptPython = await gerarBlenderScript(descricao);
          if (!scriptPython || scriptPython.startsWith("Erro OpenCode")) return `Erro ao gerar script: ${scriptPython}`;
          const r = await blender.executarScript(scriptPython);
          return r.ok ? `✅ Script executado no Blender.\n${r.stderr || ""}` : r.msg;
        }
        const caminho = args.trim();
        if (/\.blend$/i.test(caminho) || require("fs").existsSync(caminho)) {
          const r = await blender.abrir(caminho);
          return r.ok ? `✅ ${r.msg}` : r.msg;
        }
        const r = await blender.abrir(args.trim());
        return r.ok ? r.msg : `Arquivo não encontrado: ${caminho}`;
      }
      case "modelo3d": {
        if (!args) return "Uso: modelo3d | buscar [consulta] / gerar [descricao] / primitivo [tipo]";
        const modelos3d = require("./modelos3d");
        const lower = args.trim().toLowerCase();
        if (lower.startsWith("buscar ")) {
          const consulta = args.slice(7).trim();
          const resultados = await modelos3d.pesquisarOnline(consulta);
          if (!resultados.length) return `Nada encontrado para "${consulta}". Tente modelo3d | gerar [descricao] para criar um.`;
          return `Modelos 3D encontrados:\n${resultados.map((r, i) => `${i + 1}. ${r.nome} - ${r.url}`).join("\n")}`;
        }
        if (lower.startsWith("gerar ")) {
          const prompt = args.slice(6).trim();
          const res = await modelos3d.gerarPorPrompt(prompt);
          return res.ok ? `✅ ${res.msg}` : res.msg;
        }
        if (lower.startsWith("primitivo ")) {
          const tipo = args.slice(10).trim().toLowerCase() || "cube";
          const validos = ["cube", "sphere", "cylinder", "cone", "torus", "uv_sphere", "ico_sphere", "monkey"];
          if (!validos.includes(tipo)) return `Tipo invalido. Validos: ${validos.join(", ")}`;
          const res = await modelos3d.gerarPrimitivo(tipo);
          return res.ok ? res.msg : res.msg;
        }
        return "Use: buscar, gerar, ou primitivo";
      }
      case "spotify_control": {
        if (!args) return "Uso: next / previous / pause / play / volume [0-100]";
        const sendkey = require("./sendkey");
        const cmd = args.trim().toLowerCase();
        const vkMap = { next: 0xB0, previous: 0xB1, pause: 0xB3, play: 0xB3 };
        if (vkMap[cmd]) { sendkey.send(vkMap[cmd]); return `Spotify: ${cmd}`; }
        if (cmd.startsWith("volume ")) { sendkey.volume(parseInt(cmd.split(" ")[1]) || 50); return `Volume ajustado para ${cmd.split(" ")[1]}`; }
        return "Comando invalido: next, previous, pause, play, volume [0-100]";
      }
      case "youtube_pip":
      case "youtube_fullscreen": {
        const tecla = nome === "youtube_pip" ? "i" : "f";
        require("./sendkey").sendKey(tecla);
        return nome === "youtube_pip" ? "Picture-in-Picture" : "Tela Cheia";
      }
      case "ffmpeg": {
        if (!args) return "Uso: ffmpeg | [acao]: [parametros]. Acoes: converter, audio, cortar, comprimir, gif, info, screenshot.";
        const partes = args.split(":").map(s => s.trim());
        const acao = partes[0].toLowerCase();
        const resto = partes.slice(1).join(":").trim();
        if (!resto) return "Parametros insuficientes.";
        const params = resto.split(",").map(s => s.trim());
        switch (acao) {
          case "converter": {
            const [input, output, opts] = params;
            if (!input || !output) return "Uso: ffmpeg | converter: [input], [output], [opcoes]";
            const r = await ffmpeg.converter(input, output, opts || "");
            return r.ok ? `Convertido: ${input} -> ${output}` : `Erro: ${r.stderr?.slice(0, 200)}`;
          }
          case "audio": {
            const [input, output] = params;
            if (!input) return "Uso: ffmpeg | audio: [input], [output]";
            const saida = output || input.replace(/\.[^.]+$/, "") + ".mp3";
            const r = await ffmpeg.extrairAudio(input, saida);
            return r.ok ? `Audio extraido: ${saida}` : `Erro: ${r.stderr?.slice(0, 200)}`;
          }
          case "cortar": {
            const [input, inicio, duracao, output] = params;
            if (!input || !inicio || !duracao) return "Uso: ffmpeg | cortar: [input], [inicio], [duracao], [output]";
            const r = await ffmpeg.cortarVideo(input, inicio, duracao, output);
            return r.ok ? `Video cortado: ${output || "ok"}` : `Erro: ${r.stderr?.slice(0, 200)}`;
          }
          case "comprimir": {
            const [input, output, qualidade] = params;
            if (!input) return "Uso: ffmpeg | comprimir: [input], [output], [qualidade 0-51]";
            const r = await ffmpeg.comprimirVideo(input, output, parseInt(qualidade) || 28);
            return r.ok ? `Video comprimido` : `Erro: ${r.stderr?.slice(0, 200)}`;
          }
          case "gif": {
            const [input, output, fps, scale] = params;
            if (!input) return "Uso: ffmpeg | gif: [input], [output], [fps], [scale]";
            const r = await ffmpeg.gif(input, output, parseInt(fps) || 10, parseInt(scale) || 480);
            return r.ok ? `GIF criado` : `Erro: ${r.stderr?.slice(0, 200)}`;
          }
          case "info": {
            const i = await ffmpeg.info(params[0] || resto);
            if (!i) return "Nao foi possivel ler info do arquivo.";
            return JSON.stringify({ formato: i.format?.format_name, duracao: i.format?.duration, codec: i.streams?.[0]?.codec_name, resolucao: `${i.streams?.[0]?.width}x${i.streams?.[0]?.height}` }, null, 2).slice(0, 500);
          }
          case "screenshot": {
            const [input, time, output] = params;
            if (!input) return "Uso: ffmpeg | screenshot: [input], [time], [output]";
            const r = await ffmpeg.screenshot(input, time || "00:00:01", output);
            return r.ok ? `Screenshot salvo` : `Erro: ${r.stderr?.slice(0, 200)}`;
          }
          default:
            return `Acao desconhecida: ${acao}. Acoes: converter, audio, cortar, comprimir, gif, info, screenshot.`;
        }
      }
      case "falar": {
        if (!args) return "Nada pra falar.";
        try { await pc.tts(args); } catch {}
        return `Falei: ${args.slice(0, 100)}`;
      }
      case "camera": {
        try {
          const camera = require("./camera")
          const caminho = await camera.salvarFrameTemp()
          return `Foto salva em ${caminho}`
        } catch (err) {
          return `Erro camera: ${err.message}. Configure a URL com camera_url | [url]`
        }
      }
      case "camera_url": {
        if (!args) return "Uso: camera_url | [url]. Ex: camera_url | http://192.168.1.50:8080"
        const camera = require("./camera")
        return await camera.definirUrl(args)
      }
      case "clima_tempo": {
        const { clima } = require("./clima")
        const c = await clima(args || "São Paulo")
        return `Clima em ${c.cidade}: ${c.condicao}, ${c.temperatura} (sensação ${c.sensacao}), umidade ${c.umidade}, vento ${c.vento}`
      }
      case "alarme": {
        if (!args) return "Uso: alarme | [data/hora] | [mensagem]"
        const partes = args.split("|").map(s => s.trim())
        const { criar, listar } = require("./lembrete_alarme")
        if (partes[0] === "listar") {
          const alarmes = listar()
          return alarmes.length ? "Alarmes:\n" + alarmes.map(a => `- ${new Date(a.dataHora).toLocaleString("pt-BR")}: ${a.mensagem}`).join("\n") : "Nenhum alarme ativo."
        }
        const dataHora = partes[0]
        const mensagem = partes[1] || "Alarme!"
        const alarme = criar(dataHora, mensagem, "system")
        return `Alarme criado para ${new Date(alarme.dataHora).toLocaleString("pt-BR")}`
      }
      case "whatsapp": {
        if (!args) return "Uso: whatsapp | [contato] | [mensagem]"
        const partes = args.split("|").map(s => s.trim())
        if (partes.length < 2) return "Formato: whatsapp | [contato] | [mensagem]"
        const { enviar } = require("./whatsapp")
        const r = await enviar(partes[0], partes[1])
        return r.ok ? r.mensagem : `Erro: ${r.erro}`
      }
      case "email": {
        if (!args) return "Uso: email | [destino] | [assunto] | [corpo]"
        const partes = args.split("|").map(s => s.trim())
        if (partes.length < 1) return "Formato: email | [destino] | [assunto] | [corpo]"
        const destino = partes[0]
        const assunto = partes[1] || "Mensagem da Neon"
        const corpo = partes[2] || "Mensagem enviada pela Neon."
        const { enviar } = require("./email")
        const r = await enviar(destino, assunto, corpo)
        return r.ok ? `Email enviado para ${destino}` : `Erro: ${r.erro}`
      }
      case "calendario": {
        const { eventosHoje, listarEventos, status } = require("./calendario")
        const st = await status()
        if (!st.autenticado) return "Google Calendar nao configurado."
        const cmd = args?.trim().toLowerCase() || "proximos"
        if (cmd === "hoje" || cmd === "hoje ") {
          const r = await eventosHoje()
          if (!r.ok) return r.erro
          return r.eventos.length ? "Eventos hoje:\n" + r.eventos.map(e => `- ${e.titulo} (${new Date(e.inicio).toLocaleTimeString("pt-BR")})`).join("\n") : "Nenhum evento hoje."
        }
        const r = await listarEventos(5)
        if (!r.ok) return r.erro
        return r.eventos.length ? "Proximos eventos:\n" + r.eventos.map(e => `- ${e.titulo} (${new Date(e.inicio).toLocaleString("pt-BR")})`).join("\n") : "Nenhum evento futuro."
      }
      case "contexto": {
        const { get, formatarParaPrompt, estatisticas } = require("./contexto")
        const stats = estatisticas()
        return `Contexto: ${stats.totalUsuarios} usuarios, ${stats.totalMensagens} mensagens no total.`
      }
      case "fila_status": {
        const { listar, status } = require("./fila")
        const filas = listar()
        return filas.length ? `Filas ativas:\n${filas.map(f => `- Usuario ${f.userId.slice(0, 8)}: ${f.queueLength} na fila, ${f.processing ? "processando" : "parado"}`).join("\n")}` : "Nenhuma fila ativa."
      }
      case "audit": {
        const { lerAudit } = require("./permissions")
        const linhas = lerAudit(20)
        return linhas.length ? `Auditoria:\n\`\`\`\n${linhas.join("\n").slice(0, 1500)}\n\`\`\`` : "Nenhum log de auditoria."
      }
      default: {
        try {
          const { getFerramentas } = require("./plugin_loader")
          const extras = getFerramentas()
          const plugin = extras.find(f => f.nome === nome)
          if (plugin && typeof plugin.executar === "function") {
            return await plugin.executar(args)
          }
        } catch {}
        return `Ferramenta desconhecida: ${nome}`;
      }
    }
  } catch (err) {
    log("WARN", "[TOOLS] Erro na ferramenta", { nome, erro: err.message });
    return `Erro ao executar ${nome}: ${err.message}`;
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

module.exports = { descricaoFerramentas, extrairFerramentas, executarFerramenta, processarResposta, FERRAMENTAS };
