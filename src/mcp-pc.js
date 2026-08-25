const readline = require("readline");
const pc = require("./pc");

const FERRAMENTAS = [
  {
    name: "pc_info",
    description: "Informacoes do PC: SO, CPU, RAM, disco.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "pc_screenshot",
    description: "Tira um screenshot da tela e retorna o caminho do arquivo PNG.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "pc_volume",
    description: "Controla o volume do sistema. Use nivel 0-100 para definir ou um numero negativo/positivo para ajustar.",
    inputSchema: {
      type: "object",
      properties: { nivel: { type: "number", description: "Volume absoluto 0-100" } },
    },
  },
  {
    name: "pc_processos",
    description: "Lista os processos em execucao no PC (nome e PID).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "pc_matar_processo",
    description: "Mata um processo pelo PID ou nome.",
    inputSchema: {
      type: "object",
      properties: {
        pid: { type: "number", description: "PID do processo" },
        nome: { type: "string", description: "Nome do processo (ex: notepad.exe)" },
      },
    },
  },
  {
    name: "pc_clipboard",
    description: "Le o texto atual do clipboard.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "pc_notificar",
    description: "Envia uma notificacao do Windows (toast).",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        mensagem: { type: "string" },
      },
      required: ["mensagem"],
    },
  },
  {
    name: "pc_bateria",
    description: "Status da bateria (se laptop).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "pc_tecla",
    description: "Envia um atalho de teclado (ex: 'ctrl+c', 'win+r').",
    inputSchema: {
      type: "object",
      properties: { combos: { type: "string", description: "Atalho, ex: ctrl+shift+esc" } },
      required: ["combos"],
    },
  },
  {
    name: "pc_digitar",
    description: "Digita texto no aplicativo focado.",
    inputSchema: {
      type: "object",
      properties: { texto: { type: "string" } },
      required: ["texto"],
    },
  },
  {
    name: "pc_abrir_app",
    description: "Abre um aplicativo/jogo/programa do Windows pelo nome (ex: 'notepad', 'steam', 'discord', 'chrome'). Usa Start-Process para abrir como interface grafica.",
    inputSchema: {
      type: "object",
      properties: { nome: { type: "string", description: "Nome do app (ex: notepad, chrome, steam)" } },
      required: ["nome"],
    },
  },
  {
    name: "pc_criar_arquivo",
    description: "Cria um arquivo novo dentro de C:\\Users\\Pichau. Nunca sobrescreve um arquivo existente.",
    inputSchema: {
      type: "object",
      properties: {
        caminho: { type: "string", description: "Caminho relativo a C:\\Users\\Pichau ou absoluto dentro dela" },
        conteudo: { type: "string", description: "Conteúdo UTF-8 do arquivo" },
      },
      required: ["caminho"],
    },
  },
  {
    name: "pc_resumo_commits",
    description: "Retorna um resumo dos commits recentes do repositório da Neon.",
    inputSchema: {
      type: "object",
      properties: { limite: { type: "number", description: "Quantidade de commits, de 1 a 20" } },
    },
  },
  {
    name: "pc_abrir_whatsapp",
    description: "Abre o WhatsApp. Só use quando o usuário pedir explicitamente para abrir o WhatsApp.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "pc_abrir_url",
    description: "Abre uma URL http/https no navegador padrão.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "pc_iniciar_jogo_steam",
    description: "Inicia um jogo pela Steam usando o AppID numérico.",
    inputSchema: {
      type: "object",
      properties: { appid: { type: "string", description: "AppID numérico da Steam" } },
      required: ["appid"],
    },
  },
  {
    name: "pc_fechar_apps",
    description: "Fecha aplicativos com janelas abertas, preservando Medal, Steam e a Neon.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "pc_spotify_buscar_tocar",
    description: "Abre o Spotify, busca uma música por nome e artista e tenta iniciar a primeira correspondência.",
    inputSchema: {
      type: "object",
      properties: { busca: { type: "string", description: "Nome da música e, de preferência, o artista" } },
      required: ["busca"],
    },
  },
  {
    name: "pc_spotify_controle",
    description: "Controla a reprodução do Spotify: tocar, pausar, continuar, proxima ou anterior.",
    inputSchema: {
      type: "object",
      properties: {
        acao: { type: "string", enum: ["tocar", "pausar", "continuar", "proxima", "anterior"] },
      },
      required: ["acao"],
    },
  },
  {
    name: "pc_janelas",
    description: "Lista as janelas abertas.",
    inputSchema: { type: "object", properties: {} },
  },
];

function responder(id, resultado) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: resultado }) + "\n");
}

function erro(id, mensagem) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: mensagem } }) + "\n");
}

async function chamarFerramenta(nome, args) {
  let texto;
  switch (nome) {
    case "pc_info":
      texto = JSON.stringify(await pc.pcInfoJson());
      break;
    case "pc_screenshot":
      texto = JSON.stringify({ caminho: await pc.screenshot() });
      break;
    case "pc_volume":
      texto = JSON.stringify(await pc.volume(args.nivel));
      break;
    case "pc_processos":
      texto = JSON.stringify((await pc.listarProcessos()).slice(0, 50));
      break;
    case "pc_matar_processo":
      texto = JSON.stringify(await pc.matarProcesso(args.pid || args.nome));
      break;
    case "pc_clipboard":
      texto = JSON.stringify({ texto: await pc.clipboard() });
      break;
    case "pc_notificar":
      texto = JSON.stringify(await pc.notificarToast(args.titulo || "Neon", args.mensagem));
      break;
    case "pc_bateria":
      texto = JSON.stringify(await pc.bateria());
      break;
    case "pc_tecla":
      texto = JSON.stringify(await pc.tecla(args.combos));
      break;
    case "pc_digitar":
      texto = JSON.stringify(await pc.digitarTexto(args.texto));
      break;
    case "pc_abrir_app":
      texto = JSON.stringify(await pc.abrirAppPorNome(args.nome));
      break;
    case "pc_criar_arquivo":
      texto = JSON.stringify(await pc.criarArquivo(args.caminho, args.conteudo || ""));
      break;
    case "pc_resumo_commits":
      texto = JSON.stringify(await pc.resumoCommits(args.limite));
      break;
    case "pc_abrir_whatsapp":
      texto = JSON.stringify(await pc.abrirWhatsApp());
      break;
    case "pc_abrir_url":
      texto = JSON.stringify(await pc.abrirUrl(args.url));
      break;
    case "pc_iniciar_jogo_steam":
      texto = JSON.stringify(await pc.iniciarJogoSteam(args.appid));
      break;
    case "pc_fechar_apps":
      texto = JSON.stringify(await pc.fecharAppsExceto());
      break;
    case "pc_spotify_buscar_tocar":
      texto = JSON.stringify(await pc.spotifyBuscarTocar(args.busca));
      break;
    case "pc_spotify_controle":
      texto = JSON.stringify(await pc.spotifyControle(args.acao));
      break;
    case "pc_janelas":
      texto = JSON.stringify(await pc.listarJanelas());
      break;
    default:
      throw new Error(`ferramenta desconhecida: ${nome}`);
  }
  return { content: [{ type: "text", text: texto }] };
}

const rl = readline.createInterface({ input: process.stdin });

rl.on("line", async (linha) => {
  let msg;
  try {
    msg = JSON.parse(linha);
  } catch {
    return;
  }

  if (msg.method === "initialize") {
    responder(msg.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "neon-pc", version: "1.0.0" },
    });
    return;
  }

  if (msg.method === "notifications/initialized") return;

  if (msg.method === "tools/list") {
    responder(msg.id, { tools: FERRAMENTAS });
    return;
  }

  if (msg.method === "tools/call") {
    try {
      const resultado = await chamarFerramenta(msg.params?.name, msg.params?.arguments || {});
      responder(msg.id, resultado);
    } catch (err) {
      erro(msg.id, err.message);
    }
    return;
  }
});
