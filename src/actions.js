const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

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
  { nomes: ["navegador", "browser", "edge"],
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
  const match = lower.match(/^(?:abrir|abra|abre|open)\s+(.+)/i);
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
  const lower = texto.toLowerCase().trim();
  const match = lower.match(/^(?:executa|executar|roda|run)\s+(.+)/i);
  if (!match) return null;
  return match[1].trim();
}

function encontrarArquivo(texto) {
  const lower = texto.toLowerCase().trim();
  let match;

  match = lower.match(/^(?:criar arquivo|create file)\s+(.+)/i);
  if (match) return { acao: "criar", args: match[1].trim() };

  match = lower.match(/^(?:ler arquivo|read file|cat)\s+(.+)/i);
  if (match) return { acao: "ler", args: match[1].trim() };

  match = lower.match(/^(?:deletar arquivo|delete file|rm|apagar arquivo)\s+(.+)/i);
  if (match) return { acao: "deletar", args: match[1].trim() };

  match = lower.match(/^(?:listar|ls|dir)\s+(.+)/i);
  if (match) return { acao: "listar", args: match[1].trim() };

  return null;
}

function permitido(userId) {
  return userId === OWNER_ID;
}

function detectarCategoria(texto) {
  if (encontrarApp(texto)) return "app";
  if (isWin() && encontrarPcCommand(texto)) return "pcCommand";
  if (isWin() && encontrarExec(texto)) return "exec";
  if (encontrarArquivo(texto)) return "arquivo";
  return null;
}

async function executarAcao(texto, usuarioMestre = false, userId = null) {
  const podePC = permitido(userId);
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

  log("INFO", "[ACTION] nenhuma ação reconhecida", { texto });
  return null;
}

module.exports = { executarAcao };