const { log } = require("./logger");
const api = require("./api");
const pc = require("./pc");
const { lembrar } = require("./memoria");
const { abrirUrlNoOpera, tocarSpotify, tocarVideoYouTube } = require("./browser");

const FERRAMENTAS = [
  { nome: "pesquisar", desc: "Pesquisa algo na web. Uso: pesquisar | [consulta]" },
  { nome: "abrir_site", desc: "Abre um site no Opera. Uso: abrir_site | [url]" },
  { nome: "abrir_app", desc: "Abre um app/programa. Uso: abrir_app | [nome]" },
  { nome: "noticias", desc: "Mostra as ultimas noticias. Uso: noticias" },
  { nome: "clima", desc: "Previsao do tempo. Uso: clima | [cidade]" },
  { nome: "curiosidade", desc: "Fato aleatorio interessante. Uso: curiosidade" },
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
        const r = await api.searchWeb(args);
        return `Resultado da pesquisa "${args}": ${r.resultado?.slice(0, 300) || "sem resultados"}${r.url ? `\nFonte: ${r.url}` : ""}`;
      }
      case "abrir_site": {
        let url = args;
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        await abrirUrlNoOpera(url);
        return `Site aberto: ${url}`;
      }
      case "abrir_app": {
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
      case "curiosidade": {
        const f = await api.fatoAleatorio();
        return `Fato: ${f.fato}`;
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
