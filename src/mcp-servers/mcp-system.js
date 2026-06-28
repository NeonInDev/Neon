const { log } = require("../logger");
const { promisify } = require("util");
const { exec } = require("child_process");
const execAsync = promisify(exec);
const api = require("../api");
const path = require("path");
const fs = require("fs");

const tools = [
  { nome: "executar", desc: "Executa comando no terminal (CMD/PowerShell).", formato: "executar | [comando]" },
  { nome: "ler_arquivo", desc: "Le conteudo de um arquivo de texto.", formato: "ler_arquivo | [caminho]" },
  { nome: "escrever_arquivo", desc: "Escreve conteudo em um arquivo.", formato: "escrever_arquivo | [caminho] | [conteudo]" },
  { nome: "ffmpeg", desc: "Converte/processa audio/video via FFmpeg.", formato: "ffmpeg | [comando ffmpeg]" },
  { nome: "pesquisar", desc: "Pesquisa algo na internet (DuckDuckGo).", formato: "pesquisar | [termo]" },
  { nome: "noticias", desc: "Busca noticias recentes.", formato: "noticias | [topico opcional]" },
  { nome: "clima", desc: "Previsao do tempo.", formato: "clima | [cidade]" },
  { nome: "cotacao", desc: "Cotacao de moeda (USD, EUR, ARS, BTC).", formato: "cotacao | [moeda]" },
  { nome: "cinema", desc: "Busca filmes em cartaz.", formato: "cinema" },
  { nome: "gerar_imagem", desc: "Gera imagem por IA (Pollinations).", formato: "gerar_imagem | [descricao detalhada]" },
  { nome: "calcular", desc: "Realiza calculo matematico.", formato: "calcular | [expressao]" },
  { nome: "lembrar", desc: "Faz a Neon lembrar de algo.", formato: "lembrar | [texto relevante]" },
];

async function handleCall(nome, args) {
  switch (nome) {
    case "executar": {
      if (!args) return "Nada pra executar.";
      try {
        const { stdout, stderr } = await execAsync(args, { timeout: 60000, windowsHide: true });
        const saida = (stdout || stderr || "ok").slice(0, 1500);
        return `📟 Saída:\n\`\`\`\n${saida}\n\`\`\``;
      } catch (err) {
        return `❌ Erro: ${err.message}`;
      }
    }

    case "ler_arquivo": {
      if (!args) return "Caminho obrigatorio.";
      try {
        const conteudo = fs.readFileSync(args.trim(), "utf8");
        return `📄 **${args}**\n\`\`\`\n${conteudo.slice(0, 1500)}\n\`\`\``;
      } catch (err) {
        return `❌ Erro ao ler: ${err.message}`;
      }
    }

    case "escrever_arquivo": {
      if (!args || !args.includes("|")) return "❌ Use: escrever_arquivo | [caminho] | [conteudo]";
      const [caminho, ...conteudoParts] = args.split("|").map(s => s.trim());
      if (!caminho) return "❌ Caminho obrigatorio.";
      const conteudo = conteudoParts.join(" | ");
      try {
        const dir = path.dirname(caminho);
        if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(caminho, conteudo, "utf8");
        return `✅ Salvo em ${caminho}`;
      } catch (err) {
        return `❌ Erro ao salvar: ${err.message}`;
      }
    }

    case "ffmpeg": {
      if (!args) return "Comando ffmpeg obrigatorio.";
      try {
        const { stdout, stderr } = await execAsync(`ffmpeg ${args}`, { timeout: 120000, windowsHide: true });
        const saida = (stdout || stderr || "ok").slice(0, 1000);
        return `🎬 FFmpeg concluído.\n\`\`\`\n${saida}\n\`\`\``;
      } catch (err) {
        return `❌ FFmpeg erro: ${err.message}`;
      }
    }

    case "pesquisar": {
      if (!args) return "Termo obrigatorio.";
      const resultados = await api.pesquisar(args);
      if (!resultados || resultados.length === 0) return "Nada encontrado.";
      let resposta = `🔍 **Resultados para:** ${args}\n`;
      for (const r of resultados.slice(0, 5)) {
        resposta += `\n• [${r.titulo}](${r.url})`;
        if (r.desc) resposta += ` — ${r.desc.slice(0, 200)}`;
      }
      return resposta;
    }

    case "noticias": {
      const noticias = await api.noticias(args || undefined);
      if (!noticias || noticias.length === 0) return "Nenhuma noticia no momento.";
      let resposta = `📰 **Notícias**${args ? ` sobre ${args}` : ""}:\n`;
      for (const n of noticias.slice(0, 5)) {
        resposta += `\n• [${n.titulo}](${n.url})`;
        if (n.desc) resposta += ` — ${n.desc.slice(0, 200)}`;
      }
      return resposta;
    }

    case "clima": {
      if (!args) return "Cidade obrigatoria.";
      const clima = await api.clima(args);
      if (!clima) return "Cidade não encontrada.";
      return `🌤️ **${clima.cidade}**\n• Temperatura: ${clima.temperatura}°C\n• Sensação: ${clima.sensacao}°C\n• Umidade: ${clima.umidade}%\n• Vento: ${clima.vento} km/h\n• Descrição: ${clima.descricao}`;
    }

    case "cotacao": {
      if (!args) return "❌ Use: cotacao | [USD, EUR, ARS, BTC]";
      const moeda = args.trim().toUpperCase();
      const taxa = await api.cotacao(moeda);
      if (taxa === null) return `❌ Moeda "${moeda}" não encontrada.`;
      const nomeMoeda = { USD: "Dólar", EUR: "Euro", ARS: "Peso Argentino", BTC: "Bitcoin" };
      return `💰 **${nomeMoeda[moeda] || moeda}**: R$ ${taxa}`;
    }

    case "cinema": {
      const filmes = await api.cinema();
      if (!filmes || filmes.length === 0) return "Nenhum filme encontrado.";
      let resposta = "🎬 **Filmes em cartaz:**\n";
      for (const f of filmes.slice(0, 8)) {
        resposta += `\n• **${f.titulo}**`;
        if (f.genero) resposta += ` (${f.genero})`;
        if (f.ano) resposta += ` — ${f.ano}`;
      }
      return resposta;
    }

    case "gerar_imagem": {
      if (!args) return "Descricao obrigatoria.";
      const url = await api.gerarImagem(args);
      if (!url) return "❌ Falha ao gerar imagem.";
      return `🎨 Imagem gerada!\n${url}`;
    }

    case "calcular": {
      try {
        const resultado = Function(`"use strict"; return (${args})`)();
        return `🧮 ${args} = ${resultado}`;
      } catch {
        return `❌ Expressão inválida: ${args}`;
      }
    }

    case "lembrar": {
      if (!args) return "Nada pra lembrar.";
      await lembrar(args);
      return `🧠 Lembrei: "${args.slice(0, 200)}"`;
    }

    default:
      throw new Error(`Tool desconhecida: ${nome}`);
  }
}

module.exports = { nome: "System", tools, handleCall };
