const { log } = require("./logger");
const opencode = require("../plugins/opencode");
const notion = require("../plugins/notion");
const whatsapp = require("../plugins/whatsapp");
const tailscale = require("../plugins/tailscale");
const lore = require("./lore");
const poderes = require("./poderes");

function descricaoFerramentas() {
  const base = `- codar: Delega QUALQUER tarefa ao opencode. Usa navegador, PC, codigo, pesquisa, arquivo, TUDO. Uso: codar | [descricao detalhada do que fazer]`;
  const not = notion.descricaoFerramentas();
  const wa = "- whatsapp_enviar: Envia mensagem no WhatsApp (assinatura _Enviado pela Neon_ automatica). Uso: whatsapp_enviar | numero=5571999999999, mensagem=texto";
  const ts = `- tailscale_status: Mostra status da Tailscale (IP, hostname, estado, se esta online).\n- tailscale_peers: Lista todos os peers da rede (quem esta online/offline).\n- tailscale_ip: Mostra o IP Tailscale desta maquina.\n- tailscale_conectar: Roda tailscale up pra conectar.\n- tailscale_desconectar: Roda tailscale down pra desconectar.\n- tailscale_watch: Mostra historico de conectividade dos peers (do watch daemon).`;
  const lo = "- lore_buscar: Consulta o lore do servidor de RP indexado pela Neon. Uso: lore_buscar | termo de busca";
  const po = "- poderes_listar: Lista as dobras/poderes aprovados no fórum de criação do servidor. Uso: poderes_listar\n- poderes_buscar: Busca uma dobra aprovada pelo nome/termo. Uso: poderes_buscar | nome";
  const ferramentas = [base, not, wa, ts, lo, po].filter(Boolean).join("\n");
  return ferramentas;
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

async function executarFerramenta(ferramenta, userId = null) {
  const { nome, args } = ferramenta;

  // Ferramentas nativas do Notion (API oficial, sem opencode)
  if (nome.startsWith("notion_")) {
    return executarNotion(nome, args);
  }

  // Ferramenta nativa do WhatsApp (via plugin, sem opencode)
  if (nome.startsWith("whatsapp_")) {
    return executarWhatsapp(nome, args);
  }

  // Ferramentas nativas do Tailscale (via plugin, sem opencode)
  if (nome.startsWith("tailscale_")) {
    return executarTailscale(nome, args);
  }

  // Ferramenta nativa do lore (busca indexada, sem opencode)
  if (nome.startsWith("lore_")) {
    return executarLore(nome, args);
  }

  // Ferramenta nativa de poderes/dobras (busca indexada, sem opencode)
  if (nome.startsWith("poderes_")) {
    return executarPoderes(nome, args);
  }

  log("INFO", "[TOOLS] Delegando pro opencode", { nome, args: args?.slice(0, 100) });

  const resultado = await opencode.executar(args);
  return resultado || "❌ OpenCode não respondeu.";
}

async function executarWhatsapp(nome, args) {
  log("INFO", "[TOOLS][WHATSAPP]", { nome, args: args?.slice(0, 100) });
  try {
    switch (nome) {
      case "whatsapp_status": {
        const st = whatsapp.status();
        return st.conectado
          ? `✅ WhatsApp conectado.`
          : `❌ WhatsApp desconectado (${st.estado}). Reinicie a Neon e escaneie o QR.`;
      }
      case "whatsapp_enviar": {
        const m = String(args || "").match(/(?:numero|n)=(\d+)/i);
        const t = String(args || "").match(/(?:mensagem|texto|msg)=([^]*)/i);
        if (!m) return "❌ Uso: whatsapp_enviar | numero=5571999999999, mensagem=texto";
        const texto = (t ? t[1] : "").replace(/^.*mensagem=/i, "").trim();
        if (!texto) return "❌ Uso: whatsapp_enviar | numero=5571999999999, mensagem=texto";
        const r = await whatsapp.enviar(m[1], texto);
        return r.ok ? `✅ WhatsApp enviado para ${r.numero}.` : `❌ ${r.erro}`;
      }
      default:
        return `❌ Ferramenta WhatsApp desconhecida: ${nome}`;
    }
  } catch (err) {
    log("ERROR", "[TOOLS][WHATSAPP] erro", { erro: err.message?.slice(0, 150) });
    return `❌ Erro na ferramenta WhatsApp: ${err.message?.slice(0, 150)}`;
  }
}

async function executarTailscale(nome, args) {
  log("INFO", "[TOOLS][TAILSCALE]", { nome });
  try {
    switch (nome) {
      case "tailscale_status": {
        const s = tailscale.status();
        if (!s.ok) return `❌ ${s.erro}`;
        const saude = s.healthy ? `\n⚠️ Saúde: ${s.healthy}` : "";
        return `🟢 Tailscale: ${s.estado}\nIP: ${s.ip}\nHostname: ${s.hostname}\nOnline: ${s.online ? "sim" : "não"}${saude}`;
      }
      case "tailscale_peers": {
        const r = tailscale.listarPeers();
        if (!r.ok) return `❌ ${r.erro}`;
        if (!r.peers.length) return "Nenhum peer na rede.";
        const linhas = r.peers.map(p => `${p.online ? "🟢" : "🔴"} ${p.nome} (${p.ip}) [${p.tipo}]`);
        return `📡 ${r.peers.length} peer(s):\n${linhas.join("\n")}`;
      }
      case "tailscale_ip": {
        const r = tailscale.ip();
        if (!r.ok) return `❌ ${r.erro}`;
        return `IP Tailscale: ${r.ip}${r.todos.length > 1 ? `\nTodos: ${r.todos.join(", ")}` : ""}`;
      }
      case "tailscale_conectar": {
        const r = tailscale.conectar();
        return `🔌 ${r.resultado}`;
      }
      case "tailscale_desconectar": {
        const r = tailscale.desconectar();
        return `🔌 ${r.resultado}`;
      }
      case "tailscale_watch": {
        const r = tailscale.watch();
        if (!r.ok) return `❌ ${r.erro}`;
        if (!r.peers.length) return "Sem dados do watch.";
        const linhas = r.peers.map(p => `${p.online ? "🟢" : "🔴"} ${p.nome}`);
        return `👁️ Watch (${r.peers.length} peer(s)):\n${linhas.join("\n")}`;
      }
      default:
        return `❌ Ferramenta Tailscale desconhecida: ${nome}`;
    }
  } catch (err) {
    log("ERROR", "[TOOLS][TAILSCALE] erro", { erro: err.message?.slice(0, 150) });
    return `❌ Erro na ferramenta Tailscale: ${err.message?.slice(0, 150)}`;
  }
}

function executarLore(nome, args) {
  log("INFO", "[TOOLS][LORE]", { nome, args: args?.slice(0, 100) });
  try {
    switch (nome) {
      case "lore_buscar": {
        const termo = String(args || "").replace(/^(lore_buscar|termo|busca)\s*[:|=]\s*/i, "").trim();
        if (!termo) return "❌ Uso: lore_buscar | termo de busca";
        const r = lore.buscar(termo);
        if (!r.ok) return `❌ ${r.erro}`;
        if (!r.resultados.length) return `Nada no lore para "${termo}".`;
        const itens = r.resultados
          .slice(0, 3)
          .map((x) => `[${x.categoria}/${x.canal}] ${x.autor}: ${x.trecho}`)
          .join("\n\n");
        return `📖 Lore — "${termo}" (${r.total} ref.):\n${itens}`;
      }
      default:
        return `❌ Ferramenta lore desconhecida: ${nome}`;
    }
  } catch (err) {
    log("ERROR", "[TOOLS][LORE] erro", { erro: err.message?.slice(0, 150) });
    return `❌ Erro na ferramenta lore: ${err.message?.slice(0, 150)}`;
  }
}

function executarPoderes(nome, args) {
  log("INFO", "[TOOLS][PODERES]", { nome, args: args?.slice(0, 100) });
  try {
    switch (nome) {
      case "poderes_listar": {
        const aprovados = poderes.listarAprovados();
        if (!aprovados.length) return "Nenhuma dobra aprovada registrada ainda. Rode /atualizar_poderes.";
        const linhas = aprovados.map((p) => `${p.nome} (por ${p.dono || "?"}) — ${p.link}`);
        return `🌀 ${aprovados.length} dobra(s) aprovada(s):\n${linhas.join("\n")}`;
      }
      case "poderes_buscar": {
        const termo = String(args || "").replace(/^(poderes_buscar|nome|termo)\s*[:|=]\s*/i, "").trim();
        const r = poderes.buscar(termo);
        if (!r.length) return `Nada para "${termo}".`;
        const itens = r.slice(0, 3).map((p) => `[${p.nome}] (${p.link})\n${(p.postInicial || p.corpo || "").slice(0, 600)}`);
        return `🌀 Dobra(s) "${termo}":\n${itens.join("\n\n")}`;
      }
      default:
        return `❌ Ferramenta poderes desconhecida: ${nome}`;
    }
  } catch (err) {
    log("ERROR", "[TOOLS][PODERES] erro", { erro: err.message?.slice(0, 150) });
    return `❌ Erro na ferramenta poderes: ${err.message?.slice(0, 150)}`;
  }
}

async function executarNotion(nome, args) {
  log("INFO", "[TOOLS][NOTION]", { nome, args: args?.slice(0, 100) });
  const pares = {};
  for (const parte of (args || "").split(",")) {
    const eq = parte.indexOf("=");
    if (eq > 0) {
      const chave = parte.slice(0, eq).trim().toLowerCase();
      const valor = parte.slice(eq + 1).trim();
      pares[chave] = valor;
    }
  }

  try {
    switch (nome) {
      case "notion_status": {
        const s = await notion.status();
        if (!s.configurado) return "❌ Notion não configurado. Falta NOTION_API_KEY e/ou NOTION_DATABASE_ID no .env.";
        return `✅ Notion configurado. Banco: ${s.bancoId}`;
      }
      case "notion_listar": {
        const limite = parseInt(pares["limite"], 10) || 20;
        const r = await notion.listarBanco(pares["banco"] || undefined, limite);
        if (!r.ok) return `❌ ${r.erro}`;
        if (!r.paginas.length) return "Banco vazio.";
        const linhas = r.paginas.map((p) => {
          const resumo = Object.entries(p.propriedades)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" | ");
          return `• ${resumo} (id: ${p.id})`;
        });
        return `📋 ${r.total} item(ns):\n${linhas.join("\n")}`;
      }
      case "notion_criar": {
        if (!pares["nome"]) return "❌ Uso: notion_criar | nome=X, materia=select:Matematica, status=Em andamento";
        const props = { nome: pares["nome"] };
        for (const [k, v] of Object.entries(pares)) {
          if (k !== "nome") props[k] = v;
        }
        const r = await notion.criarPagina(props, pares["banco"] || undefined);
        if (!r.ok) return `❌ ${r.erro}`;
        return `✅ Item criado: ${r.url}`;
      }
      case "notion_atualizar": {
        if (!pares["id"]) return "❌ Uso: notion_atualizar | id=<pageId>, status=select:Feito";
        const props = {};
        for (const [k, v] of Object.entries(pares)) {
          if (k !== "id") props[k] = v;
        }
        const r = await notion.atualizarPagina(pares["id"], props);
        if (!r.ok) return `❌ ${r.erro}`;
        return `✅ Item atualizado: ${r.url}`;
      }
      case "agenda_listar": {
        const limite = parseInt(pares["limite"], 10) || 30;
        const r = await notion.listarEventos(pares["banco"] || undefined, limite);
        if (!r.ok) return `❌ ${r.erro}`;
        if (!r.eventos.length) return "Agenda vazia.";
        const linhas = r.eventos.map((p) => {
          const resumo = Object.entries(p.propriedades)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" | ");
          return `• ${resumo} (id: ${p.id})`;
        });
        return `📅 ${r.total} evento(s):\n${linhas.join("\n")}`;
      }
      case "agenda_criar": {
        if (!pares["nome"] || !pares["data"]) return "❌ Uso: agenda_criar | nome=X, data=2026-08-25T14:00:00, descricao=Y, status=Planejado";
        const r = await notion.criarEvento({
          nome: pares["nome"],
          data: pares["data"],
          descricao: pares["descricao"],
          status: pares["status"],
        }, pares["banco"] || undefined);
        if (!r.ok) return `❌ ${r.erro}`;
        return `✅ Evento criado: ${r.url}`;
      }
      default:
        return `❌ Ferramenta Notion desconhecida: ${nome}`;
    }
  } catch (err) {
    log("ERROR", "[TOOLS][NOTION] erro", { erro: err.message?.slice(0, 150) });
    return `❌ Erro na ferramenta Notion: ${err.message?.slice(0, 150)}`;
  }
}

async function processarResposta(texto, userId = null) {
  const ferramentas = extrairFerramentas(texto);
  if (!ferramentas.length) return { texto, acoes: [] };
  const resultados = [];
  for (const f of ferramentas) {
    const res = await executarFerramenta(f, userId);
    resultados.push({ ferramenta: f, resultado: res });
  }
  return { texto, acoes: resultados };
}

function iniciar() {
  log("INFO", "[TOOLS] Tudo delegado ao opencode serve");
  opencode.iniciarServer().catch(() => {});
}

module.exports = { iniciar, executarFerramenta, processarResposta, descricaoFerramentas, extrairFerramentas };
