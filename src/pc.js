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
  const safe = texto.replace(/"/g, '\\"').replace(/'/g, "''");
  const script = `
try {
  $v = New-Object -ComObject Sapi.SpVoice
  $v.Speak("${safe}")
  Write-Output "OK"
} catch { Write-Error $_.Exception.Message }`;
  await ps(script, "tts");
  return `🗣️ Falei: "${texto.slice(0, 100)}"`;
}

module.exports = { screenshot, pcInfo, volume, clipboard, tts };
