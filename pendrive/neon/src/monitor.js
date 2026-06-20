const { log } = require("./logger");
const pc = require("./pc");

let intervals = [];
let client = null;

function iniciar(discordClient) {
  client = discordClient;
  log("INFO", "[MONITOR] Monitoramento proativo iniciado");

  verificarDesligamento().catch(() => {});
  const check = () => verificarSistema().catch(() => {});
  check();
  intervals.push(setInterval(check, 30 * 60 * 1000));

  const daily = () => resumoDiario().catch(() => {});
  const agendaDaily = () => {
    const agora = new Date();
    const msAte7h = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 7, 0, 0) - agora;
    setTimeout(() => {
      daily();
      intervals.push(setInterval(daily, 24 * 60 * 60 * 1000));
    }, msAte7h > 0 ? msAte7h : msAte7h + 86400000);
  };
  agendaDaily();
}

function parar() {
  intervals.forEach(i => clearInterval(i));
  intervals = [];
  client = null;
  log("INFO", "[MONITOR] Monitoramento parado");
}

async function verificarSistema() {
  try {
    const info = await pc.pcInfo();
    const linhas = info.split("\n");
    const alerts = [];

    const diskLine = linhas.find(l => l.includes("Disco") || l.includes("GB"));
    if (diskLine) {
      const m = diskLine.match(/(\d+[,.]?\d*)\s*GB\s*(?:livre|free|disponivel)/i);
      if (m && parseFloat(m[1]) < 10) alerts.push("Disco com menos de 10GB livre!");
    }

    const cpuLine = linhas.find(l => l.includes("CPU"));
    if (cpuLine) {
      const m = cpuLine.match(/(\d+[,.]?\d*)%/);
      if (m && parseFloat(m[1]) > 90) alerts.push("CPU acima de 90%!");
    }

    const ramLine = linhas.find(l => l.includes("RAM") || l.includes("Memoria"));
    if (ramLine) {
      const m = ramLine.match(/(\d+[,.]?\d*)%/);
      if (m && parseFloat(m[1]) > 90) alerts.push("RAM acima de 90%!");
    }

    if (alerts.length && client?.isReady()) {
      const ownerId = "1442928336329379925";
      try {
        const user = await client.users.fetch(ownerId);
        await user.send("⚠️ **Alerta do Sistema:**\n" + alerts.join("\n"));
        log("INFO", "[MONITOR] Alerta enviado", { alerts });
      } catch {}
    }
  } catch (err) {
    log("WARN", "[MONITOR] Erro na verificacao", { erro: err.message });
  }
}

async function verificarDesligamento() {
  if (!client?.isReady()) return;
  try {
    const { exec: execCb } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(execCb);
    const fs = require("fs");
    const path = require("path");

    const psScript = path.join(__dirname, "..", "tmp_check_shutdown.ps1");
    const scriptContent = `
$evt = Get-WinEvent -FilterHashtable @{LogName='System'; Id=41} -MaxEvents 1 -ErrorAction SilentlyContinue
if ($evt) {
  Write-Output $evt.TimeCreated.ToString('dd/MM/yyyy HH:mm:ss')
} else {
  Write-Output 'none'
}
`;
    fs.writeFileSync(psScript, scriptContent.trim(), "utf8");
    const { stdout } = await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psScript}"`, { timeout: 10000 });
    fs.unlinkSync(psScript);
    const result = stdout?.trim();
    if (result && result !== "none") {
      const dataHora = result;
      const ownerId = "1442928336329379925";
      const user = await client.users.fetch(ownerId);
      await user.send(`⚠️ **Desligamento inesperado detectado!**\n📅 Data: ${dataHora}\n💡 Possível causa: Kernel-Power (Event ID 41)\nIsso pode indicar queda de energia, falha na fonte, superaquecimento ou travamento do sistema.\n\nVerifique se o PC está estável e com boa ventilação.`);
      log("INFO", "[MONITOR] Desligamento inesperado reportado", { dataHora });
    }
  } catch (err) {
    log("WARN", "[MONITOR] Erro ao verificar desligamento", { erro: err.message });
  }
}

async function resumoDiario() {
  if (!client?.isReady()) return;
  try {
    const info = await pc.pcInfo();
    const ownerId = "1442928336329379925";
    const user = await client.users.fetch(ownerId);
    await user.send("☀️ **Bom dia!** Aqui está o resumo do seu PC:\n```\n" + info + "\n```");
    log("INFO", "[MONITOR] Resumo diario enviado");
  } catch (err) {
    log("WARN", "[MONITOR] Erro no resumo diario", { erro: err.message });
  }
}

module.exports = { iniciar, parar };
