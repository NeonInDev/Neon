const { exec } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const execAsync = promisify(exec);

const TMP = process.env.TEMP || "C:\\Temp";
const SCRIPTS_DIR = path.join(__dirname, "scripts");
if (!fs.existsSync(SCRIPTS_DIR)) fs.mkdirSync(SCRIPTS_DIR, { recursive: true });

async function ps(script, label) {
  const tmpFile = path.join(TMP, `neon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.ps1`);
  fs.writeFileSync(tmpFile, script, "utf8");
  try {
    const { stdout, stderr } = await execAsync(`powershell -NoProfile -File "${tmpFile}"`, { timeout: 30000 });
    if (stderr) throw new Error(stderr.trim());
    return stdout.trim();
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

async function screenshot() {
  const script = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
try {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $path = "$env:TEMP\\neon_ss.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Output $path
} catch { Write-Error $_.Exception.Message }`;
  return await ps(script, "screenshot");
}

async function pcInfo() {
  return await ps(fs.readFileSync(path.join(SCRIPTS_DIR, "pcinfo.ps1"), "utf8"), "pcInfo");
}

async function volume(acao, valor) {
  // acao: "up", "down", "mute", "set"
  if (acao === "mute") {
    await execAsync(`powershell -NoProfile -Command "(New-Object -ComObject wscript.shell).SendKeys([char]174)"`, { timeout: 5000 });
    return "🔇 Volume mutado/desmutado.";
  }
  if (acao === "up") {
    const n = Math.min(parseInt(valor) || 5, 50);
    const script = `
$obj = New-Object -ComObject wscript.shell
for ($i = 0; $i -lt ${n}; $i++) { $obj.SendKeys([char]175) }`;
    await ps(script, "volumeUp");
    return `🔊 Volume aumentado (${n}x).`;
  }
  if (acao === "down") {
    const n = Math.min(parseInt(valor) || 5, 50);
    const script = `
$obj = New-Object -ComObject wscript.shell
for ($i = 0; $i -lt ${n}; $i++) { $obj.SendKeys([char]174) }`;
    await ps(script, "volumeDown");
    return `🔉 Volume diminuído (${n}x).`;
  }
  if (acao === "set") {
    const n = Math.min(Math.max(parseInt(valor) || 50, 0), 100);
    const script = `
$obj = New-Object -ComObject wscript.shell
for ($i = 0; $i -lt 50; $i++) { $obj.SendKeys([char]174) }
$steps = [math]::Round($n / 2)
for ($i = 0; $i -lt $steps; $i++) { $obj.SendKeys([char]175) }`;
    await ps(script, "volumeSet");
    return `🔊 Volume ajustado para ${n}%.`;
  }
  return "❌ Comando de volume não reconhecido.";
}

async function clipboard(acao, texto) {
  if (acao === "copiar") {
    await execAsync(`powershell -NoProfile -Command "Set-Clipboard -Value '${texto.replace(/'/g, "''")}'"`, { timeout: 5000 });
    return `📋 Copiado: "${texto.slice(0, 100)}"`;
  }
  if (acao === "colar") {
    const { stdout } = await execAsync(`powershell -NoProfile -Command "Get-Clipboard"`, { timeout: 5000 });
    const conteudo = stdout.trim();
    if (conteudo) return `📋 Clipboard: "${conteudo.slice(0, 500)}"`;
    return "📋 Clipboard vazio.";
  }
  return "❌ Comando de clipboard não reconhecido.";
}

async function tts(texto) {
  const safe = texto.replace(/"/g, '""').replace(/'/g, "''");
  const cmd = `powershell -NoProfile -Command "(New-Object -ComObject Sapi.SpVoice).Speak('${safe}')"`;
  execAsync(cmd, { timeout: 15000 }).catch(() => {});
  return `🗣️ Falei: "${texto.slice(0, 100)}"`;
}

async function listarProcessos() {
  const script = `Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 Name, Id, @{N='CPU';E={'{0:N1}' -f $_.CPU}}, @{N='MemMB';E={'{0:N0}' -f ($_.WorkingSet64/1MB)}} | Format-Table -AutoSize | Out-String -Width 200`;
  const out = await ps(script, "listProcess");
  const lines = out.split("\n").slice(3).filter(l => l.trim() && !l.endsWith("----")).slice(0, 15).map(l => l.trim()).join("\n");
  return lines;
}

async function matarProcesso(nome) {
  const script = `Stop-Process -Name "${nome}" -Force -ErrorAction Stop; Write-Output "ok"`;
  await ps(script, "killProcess");
  return `✅ Processo "${nome}" finalizado.`;
}

async function infoRede() {
  const script = `
$adapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -eq $adapter.Name } | Select-Object -First 1).IPAddress
$wifi = (Get-NetConnectionProfile | Where-Object { $_.Name -ne $null } | Select-Object -First 1).Name
$ssid = (netsh wlan show interfaces | Select-String "SSID" | Select-String -NotMatch "BSSID" | Select-Object -First 1).ToString().Split(':')[1].Trim()
Write-Output "IP: $ip"
Write-Output "Rede: $wifi"
Write-Output "WiFi: $ssid"
Write-Output "Adaptador: $($adapter.Name)"`;
  return await ps(script, "netInfo");
}

async function bateria() {
  const script = `$bat = Get-WmiObject Win32_Battery
if ($bat) {
  $pct = [int]$bat.EstimatedChargeRemaining
  $s = switch ($bat.BatteryStatus) {
    1 { "Descarregando" }
    2 { "Carregando" }
    3 { "Completa" }
    4 { "Baixa" }
    5 { "Critica" }
    6 { "Em pausa" }
    7 { "Carregando (alto)" }
    11 { "Conectada" }
    default { "Desconhecido" }
  }
  Write-Output "Nivel: $pct%"
  Write-Output "Status: $s"
  if ($bat.EstimatedRunTime -gt 0) { Write-Output "Autonomia: $($bat.EstimatedRunTime) min" }
} else { Write-Output "Sem bateria detectada (PC de mesa?)" }`;
  return await ps(script, "battery");
}

async function notificar(titulo, mensagem) {
  const script = `$popup = New-Object -ComObject wscript.shell; $popup.Popup("${mensagem.replace(/"/g,'""')}", 5, "${titulo.replace(/"/g,'""')}", 64) | Out-Null`;
  try {
    await ps(script, "notify");
  } catch {}
  return `🔔 Notificação enviada: "${titulo}"`;
}

async function enviarEmail(para, assunto, corpo) {
  const script = `
Send-MailMessage -To "${para}" -Subject "${assunto}" -Body "${corpo}" -SmtpServer "localhost" -From "neon@localhost" -ErrorAction Stop
Write-Output "ok"`;
  try {
    await ps(script, "email");
    return `📧 Email enviado para ${para}.`;
  } catch {
    try {
      const fallback = `powershell -NoProfile -Command "$o = New-Object -ComObject Outlook.Application; $m = $o.CreateItem(0); $m.To = '${para}'; $m.Subject = '${assunto}'; $m.Body = '${corpo}'; $m.Send()"`;
      await execAsync(fallback, { timeout: 10000 });
      return `📧 Email enviado via Outlook para ${para}.`;
    } catch {
      throw new Error("Não foi possível enviar email. Configure um servidor SMTP ou Outlook.");
    }
  }
}

module.exports = { screenshot, pcInfo, volume, clipboard, tts, listarProcessos, matarProcesso, infoRede, bateria, notificar, enviarEmail };
