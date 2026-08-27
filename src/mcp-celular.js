const readline = require("readline");
const celular = require("./celular");
const termux = require("./termux");

const FERRAMENTAS = [
  {
    name: "celular_status",
    description: "Status do celular via adb: conectado ou nao, IP e porta configurados.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "celular_conectar",
    description: "Conecta no celular via adb wireless (IP:porta configurado).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "celular_desconectar",
    description: "Desconecta o celular via adb.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "celular_espelhar",
    description: "Abre o espelho da tela do celular no PC (scrcpy) - controle com mouse e teclado.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "celular_abrir_app",
    description: "Abre um app no celular. Aceita nome comum (whatsapp, youtube, spotify, instagram...) ou pacote.",
    inputSchema: {
      type: "object",
      properties: { app: { type: "string", description: "Nome do app ou pacote (ex: whatsapp)" } },
      required: ["app"],
    },
  },
  {
    name: "celular_toque",
    description: "Toca na tela do celular em coordenadas X Y (pixels).",
    inputSchema: {
      type: "object",
      properties: { x: { type: "number" }, y: { type: "number" } },
      required: ["x", "y"],
    },
  },
  {
    name: "celular_deslizar",
    description: "Desliza (swipe) na tela do celular de X1 Y1 ate X2 Y2.",
    inputSchema: {
      type: "object",
      properties: {
        x1: { type: "number" }, y1: { type: "number" },
        x2: { type: "number" }, y2: { type: "number" },
        duracao: { type: "number", description: "duracao em ms (opcional, default 300)" },
      },
      required: ["x1", "y1", "x2", "y2"],
    },
  },
  {
    name: "celular_digitar",
    description: "Digita texto no campo focado do celular.",
    inputSchema: {
      type: "object",
      properties: { texto: { type: "string" } },
      required: ["texto"],
    },
  },
  {
    name: "celular_tecla",
    description: "Envia tecla de hardware no celular (home, voltar, apps, power, volume_up, silencia, enter).",
    inputSchema: {
      type: "object",
      properties: { tecla: { type: "string", description: "home, voltar, apps, power, volume_up, silencia, enter" } },
      required: ["tecla"],
    },
  },
  {
    name: "celular_print",
    description: "Tira um print da tela do celular e retorna o caminho do arquivo PNG.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "termux_rodar",
    description: "Roda um comando no celular via Termux SSH. Requer termux_config.json com o IP do Termux.",
    inputSchema: {
      type: "object",
      properties: { comando: { type: "string", description: "Comando shell para rodar no Termux" } },
      required: ["comando"],
    },
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
    case "celular_status": {
      const st = await celular.status();
      texto = JSON.stringify({ ip: st.ip, porta: st.porta, dispositivo: st.dispositivo, conectado: st.conectado, device: st.device });
      break;
    }
    case "celular_conectar": {
      const r = await celular.conectar();
      texto = JSON.stringify({ ok: r.ok, mensagem: r.msg });
      break;
    }
    case "celular_desconectar": {
      const r = await celular.desconectar();
      texto = JSON.stringify({ ok: r.ok, mensagem: r.msg });
      break;
    }
    case "celular_espelhar": {
      const r = celular.espelhar();
      texto = JSON.stringify({ ok: r.ok, mensagem: r.msg });
      break;
    }
    case "celular_abrir_app": {
      const pacote = celular.acharPacote(args.app);
      if (!pacote) throw new Error(`app desconhecido: ${args.app}`);
      const r = await celular.abrirApp(pacote);
      texto = JSON.stringify({ ok: r.ok, mensagem: r.msg, pacote });
      break;
    }
    case "celular_toque": {
      const r = await celular.toque(args.x, args.y);
      texto = JSON.stringify({ ok: r.ok, mensagem: r.msg });
      break;
    }
    case "celular_deslizar": {
      const r = await celular.deslizar(args.x1, args.y1, args.x2, args.y2, args.duracao);
      texto = JSON.stringify({ ok: r.ok, mensagem: r.msg });
      break;
    }
    case "celular_digitar": {
      const r = await celular.digitar(args.texto);
      texto = JSON.stringify({ ok: r.ok, mensagem: r.msg });
      break;
    }
    case "celular_tecla": {
      const r = await celular.tecla(args.tecla);
      texto = JSON.stringify({ ok: r.ok, mensagem: r.msg });
      break;
    }
    case "celular_print": {
      const r = await celular.printTela();
      texto = JSON.stringify({ ok: r.ok, mensagem: r.msg, caminho: r.caminho || null });
      break;
    }
    case "termux_rodar": {
      const r = await termux.rodarComando(args.comando);
      texto = JSON.stringify({ ok: r.ok, mensagem: r.msg });
      break;
    }
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
      serverInfo: { name: "neon-celular", version: "1.0.0" },
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
