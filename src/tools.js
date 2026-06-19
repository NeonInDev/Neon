const { log } = require("./logger");
const api = require("./api");
const pc = require("./pc");
const { lembrar } = require("./memoria");
const { abrirUrlNoOpera, tocarSpotify, tocarVideoYouTube } = require("./browser");
const axios = require("axios");

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
  { nome: "lembrar", desc: "Salva algo na memoria. Uso: lembrar | [chave]: [valor]" },
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
];

function descricaoFerramentas() {
  return FERRAMENTAS.map(f => `- ${f.nome}: ${f.desc}`).join("\n");
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
        const doisP = args.indexOf(":");
        if (doisP > 0) {
          const chave = args.slice(0, doisP).trim();
          const valor = args.slice(doisP + 1).trim();
          return await lembrar(chave, valor);
        }
        return await lembrar("info", args);
      }
      case "tocar_musica": {
        if (!args) return "Nada pra tocar.";
        await tocarSpotify(args);
        return `Tocando "${args}" no Spotify`;
      }
      case "tocar_video": {
        if (!args) return "Nada pra tocar.";
        await tocarVideoYouTube(args);
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
      case "falar": {
        if (!args) return "Nada pra falar.";
        try { await pc.tts(args); } catch {}
        return `Falei: ${args.slice(0, 100)}`;
      }
      default:
        return `Ferramenta desconhecida: ${nome}`;
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
