const pc = require("../pc");
const { log } = require("../logger");
const { lembrar } = require("../memoria");
const path = require("path");
const fs = require("fs");

const tools = [
  { nome: "pcInfo", desc: "Status do PC (CPU, RAM, Disco).", formato: "pcInfo" },
  { nome: "screenshot", desc: "Tira print da tela.", formato: "screenshot" },
  { nome: "volume", desc: "Define volume (0-100).", formato: "volume | [0-100]" },
  { nome: "falar", desc: "Fala algo em voz alta (TTS).", formato: "falar | [texto]" },
  { nome: "click_at", desc: "Clica em coordenada (x y).", formato: "click_at | [x] [y]" },
  { nome: "right_click_at", desc: "Clique direito em (x y).", formato: "right_click_at | [x] [y]" },
  { nome: "tecla", desc: "Pressiona tecla (enter, tab, esc, up, down, etc).", formato: "tecla | [tecla]" },
  { nome: "mover_mouse", desc: "Move mouse para (x y).", formato: "mover_mouse | [x] [y]" },
  { nome: "arrastar", desc: "Arrasta mouse de (x1 y1) ate (x2 y2).", formato: "arrastar | [x1] [y1] [x2] [y2]" },
  { nome: "achar_janela", desc: "Foca em janela pelo titulo.", formato: "achar_janela | [titulo]" },
  { nome: "listar_janelas", desc: "Lista janelas abertas.", formato: "listar_janelas" },
  { nome: "fechar_janela", desc: "Fecha janela pelo titulo.", formato: "fechar_janela | [titulo]" },
  { nome: "visao", desc: "Analisa a tela do PC com IA.", formato: "visao | [o que procurar?]" },
  { nome: "clicar_em", desc: "Clica em elemento na tela (visao + mouse).", formato: "clicar_em | [descricao]" },
  { nome: "digitar_em", desc: "Digita em campo na tela (visao + teclado).", formato: "digitar_em | [campo] | [texto]" },
  { nome: "contexto", desc: "Mostra historico da conversa.", formato: "contexto" },
  { nome: "alarme", desc: "Cria alarme com som.", formato: "alarme | [data/hora] | [mensagem]" },
  { nome: "lembrete", desc: "Cria lembrete pra horario especifico.", formato: "lembrete | [em X minutos ou HH:MM] | [texto]" },
  { nome: "agendar", desc: "Agenda tarefa pra depois.", formato: "agendar | [em X min/h/dias] | [mensagem/comando]" },
  { nome: "neon_pc", desc: "Mostra em qual PC a Neon foi instalada.", formato: "neon_pc" },
  { nome: "mcp", desc: "Gerencia servidores MCP externos (status, conectar, reconectar).", formato: "mcp | status/conectar/nome | [comando]" },
];

async function handleCall(nome, args) {
  switch (nome) {
    case "pcInfo":
      return await pc.pcInfo();

    case "screenshot": {
      const caminho = await pc.screenshot();
      return `📸 Print salvo em: ${caminho}`;
    }

    case "volume": {
      const v = parseInt(args);
      if (isNaN(v)) return "❌ Use: volume | [0-100]";
      return await pc.volume("set", v);
    }

    case "falar":
      return await pc.tts(args || "");

    case "click_at": {
      const [x, y] = args.split(/\s+/).map(Number);
      if (isNaN(x) || isNaN(y)) return "❌ Use: click_at | [x] [y]";
      await pc.clicarMouse(x, y, "left");
      return `🖱️ Clique em (${x}, ${y}).`;
    }

    case "right_click_at": {
      const [x, y] = args.split(/\s+/).map(Number);
      if (isNaN(x) || isNaN(y)) return "❌ Use: right_click_at | [x] [y]";
      await pc.clicarMouse(x, y, "right");
      return `🖱️ Clique direito em (${x}, ${y}).`;
    }

    case "tecla": {
      if (!args) return "❌ Tecla obrigatoria.";
      await pc.tecla(args);
      return `⌨️ Tecla: ${args}`;
    }

    case "mover_mouse": {
      const [x, y] = args.split(/\s+/).map(Number);
      if (isNaN(x) || isNaN(y)) return "❌ Use: mover_mouse | [x] [y]";
      await pc.moverMouse(x, y);
      return `🖱️ Mouse movido para (${x}, ${y}).`;
    }

    case "arrastar": {
      const partes = args.split(/\s+/).map(Number);
      if (partes.length < 4 || partes.some(isNaN)) return "❌ Use: arrastar | [x1] [y1] [x2] [y2]";
      await pc.arrastar(partes[0], partes[1], partes[2], partes[3]);
      return `🖱️ Arrastado de (${partes[0]},${partes[1]}) para (${partes[2]},${partes[3]}).`;
    }

    case "achar_janela": {
      if (!args) return "❌ Titulo obrigatorio.";
      const res = await pc.acharJanela(args);
      return res === "nao_encontrado" ? `❌ Janela "${args}" não encontrada.` : `✅ ${res}`;
    }

    case "listar_janelas":
      return `📋 Janelas:\n${await pc.listarJanelas()}`;

    case "fechar_janela": {
      if (!args) return "❌ Titulo obrigatorio.";
      await pc.fecharJanela(args);
      return `❌ Janela "${args}" fechada.`;
    }

    case "visao": {
      const resultado = await pc.verTela(args || "");
      if (resultado.erro) return `❌ ${resultado.erro}`;
      return `👁️ **Analise da tela:**\n${resultado.descricao}`;
    }

    case "clicar_em": {
      if (!args) return "❌ Descricao obrigatoria.";
      const visao = await pc.verTela(`Encontre e descreva a posicao exata de: ${args}`);
      if (visao.erro) return `❌ Não consegui enxergar: ${visao.erro}`;
      const matchCoords = visao.descricao.match(/\((\d+),\s*(\d+)\)/);
      if (matchCoords) {
        await pc.clicarMouse(parseInt(matchCoords[1]), parseInt(matchCoords[2]));
        return `👁️🔘 Cliquei em "${args}".`;
      }
      return `👁️ Vi mas não achei coordenadas exatas. Detalhe melhor.\n${visao.descricao.slice(0, 500)}`;
    }

    case "digitar_em": {
      const [campo, ...textoParts] = args.split("|").map(s => s.trim());
      if (!campo || !textoParts.length) return "❌ Use: digitar_em | [campo] | [texto]";
      const texto = textoParts.join(" | ");
      const visao = await pc.verTela(`Encontre o campo de texto: ${campo}`);
      if (visao.erro) return `❌ ${visao.erro}`;
      const matchCoords = visao.descricao.match(/\((\d+),\s*(\d+)\)/);
      if (matchCoords) {
        await pc.clicarMouse(parseInt(matchCoords[1]), parseInt(matchCoords[2]));
        await pc.digitarTexto(texto);
        return `⌨️ Digitei "${texto.slice(0, 50)}" em "${campo}".`;
      }
      return `👁️⚠️ Campo "${campo}" não localizado.`;
    }

    case "contexto": {
      const ctx = require("../contexto");
      return `📋 Contexto:\n${await ctx.formatarParaPrompt()}`;
    }

    case "alarme": {
      if (!args || !args.includes("|")) return "❌ Use: alarme | [data/hora] | [mensagem]";
      const [dataHora, mensagem] = args.split("|").map(s => s.trim());
      const { criarAlarme } = require("../lembrete_alarme");
      await criarAlarme(mensagem, dataHora);
      return `⏰ Alarme criado para ${dataHora}: "${mensagem}"`;
    }

    case "lembrete": {
      if (!args || !args.includes("|")) return "❌ Use: lembrete | [quando] | [texto]";
      const [quando, texto] = args.split("|").map(s => s.trim());
      const { criarLembrete } = require("../lembrete_alarme");
      await criarLembrete(texto, quando);
      return `📝 Lembrete criado: "${texto.slice(0, 100)}" (${quando})`;
    }

    case "agendar": {
      if (!args || !args.includes("|")) return "❌ Use: agendar | [em X min/h/dias] | [mensagem/comando]";
      const [tempo, comando] = args.split("|").map(s => s.trim());
      const agendados = require("../agendados");
      await agendados.agendar(tempo, comando);
      return `📅 Agendado para ${tempo}: "${comando.slice(0, 100)}"`;
    }

    case "neon_pc": {
      try {
        const pcFile = path.join(__dirname, "..", "..", "neon_pc.json");
        if (fs.existsSync(pcFile)) {
          const data = JSON.parse(fs.readFileSync(pcFile, "utf8"));
          return `🖥️ Neon foi instalada em **${data.hostname}** (usuário: ${data.usuario}, em ${data.installedAt})`;
        }
        return `🖥️ Neon está rodando em **${require("os").hostname()}**`;
      } catch { return `🖥️ ${require("os").hostname()}`; }
    }

    case "mcp": {
      const mcp = require("../mcp");
      const partes = args.split("|").map((s) => s.trim());
      const cmd = partes[0]?.toLowerCase() || "status";
      if (cmd === "status") {
        const info = mcp.getServidoresInfo();
        let out = "🤖 **Servidores MCP:**\n";
        for (const s of info) {
          const icone = s.tipo === "externo" ? (s.conectado ? "🟢" : "🔴") : "🟢";
          out += `\n${icone} **${s.nome}** (${s.tipo}) — ${s.tools.length} tools`;
          if (s.tipo === "externo" && s.comando) out += `\n   \`${s.comando}\``;
          if (s.tools.length > 0) out += `\n   \`${s.tools.join(", ")}\``;
        }
        return out;
      }
      if (cmd === "conectar" || cmd === "reconectar") {
        const nomeServer = partes[1];
        if (!nomeServer) {
          const config = mcp.carregarConfig();
          const disponiveis = config.servidores.filter((s) => s.enabled !== false);
          if (disponiveis.length === 0) return "❌ Nenhum servidor configurado. Edite mcp-config.json.";
          let out = "📋 **Servidores disponiveis no config:**\n";
          for (const s of disponiveis) {
            const status = mcp.getServidoresInfo().find((x) => x.nome === s.nome);
            const icone = status?.conectado ? "🟢" : "🔴";
            out += `\n${icone} **${s.nome}** — \`${s.comando}\``;
            if (s.descricao) out += `\n   ${s.descricao}`;
          }
          return out;
        }
        await mcp.conectarStdio(nomeServer, partes[2] || "");
        return `✅ Conectado ao servidor MCP: ${nomeServer}`;
      }
      return "❌ Use: `mcp | status` para ver servidores ou `mcp | conectar | [nome]`";
    }

    default:
      throw new Error(`Tool desconhecida: ${nome}`);
  }
}

module.exports = { nome: "PC", tools, handleCall };
