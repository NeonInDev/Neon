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

// ===================== COMPUTER USE: VISÃO =====================

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

async function screenshotBase64() {
  const script = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
try {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  $base64 = [Convert]::ToBase64String($ms.ToArray())
  $ms.Dispose()
  Write-Output $base64
} catch { Write-Error $_.Exception.Message }`;
  return await ps(script, "screenshotBase64");
}

// ===================== COMPUTER USE: MOUSE =====================

async function moverMouse(x, y) {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
Write-Output "ok"`;
  return await ps(script.replace("$x", x).replace("$y", y), "moveMouse");
}

async function clicarMouse(x, y, botao = "left") {
  const btn = botao === "right" ? "Right" : "Left";
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
[System.Windows.Forms.SendKeys]::SendWait("{${btn}}")
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait("{${btn}}")
Write-Output "ok"`;
  return await ps(script, "clickMouse");
}

async function duploClique(x, y) {
  await moverMouse(x, y);
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
[System.Windows.Forms.SendKeys]::SendWait("{Left}")
Start-Sleep -Milliseconds 50
[System.Windows.Forms.SendKeys]::SendWait("{Left}")
Write-Output "ok"`;
  return await ps(script, "doubleClick");
}

async function arrastar(x1, y1, x2, y2) {
  const script = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x1}, ${y1})
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait("{Left}")
$null = [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x2}, ${y2})
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait("{Left}")
Write-Output "ok"`;
  return await ps(script, "drag");
}

// ===================== COMPUTER USE: TECLADO =====================

async function digitarTexto(texto) {
  const safe = texto.replace(/[<>{}()&^%$#@!~`"'|\\\/;:.,?+\-*=\[\] ]/g, ' ').trim();
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${texto.replace(/"/g, '""')}")
Write-Output "ok"`;
  return await ps(script, "typeText");
}

async function tecla(tecla) {
  const mapa = {
    enter: "{Enter}", tab: "{Tab}", esc: "{Esc}", space: " ",
    backspace: "{Backspace}", delete: "{Delete}", home: "{Home}", end: "{End}",
    up: "{Up}", down: "{Down}", left: "{Left}", right: "{Right}",
    f5: "{F5}", f11: "{F11}",
    ctrl_c: "^c", ctrl_v: "^v", ctrl_x: "^x", ctrl_z: "^z", ctrl_s: "^s", ctrl_a: "^a",
    alt_tab: "%{Tab}",
    win: "^{Esc}",
    win_r: "^{Esc}",  // placeholder
    printscreen: "{PRTSC}",
  };
  const cmd = mapa[tecla.toLowerCase()] || tecla;
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${cmd}")
Write-Output "ok"`;
  return await ps(script, "keyPress");
}

// ===================== COMPUTER USE: JANELAS =====================

async function acharJanela(titulo) {
  const script = `
$w = Get-Process | Where-Object { $_.MainWindowTitle -match "${titulo.replace(/"/g, '""')}" } | Select-Object -First 1
if ($w) {
  Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class Win32 {
      [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
      [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    }
"@
  [Win32]::ShowWindow($w.MainWindowHandle, 9)
  Start-Sleep -Milliseconds 100
  [Win32]::SetForegroundWindow($w.MainWindowHandle)
  Write-Output "ok: $($w.ProcessName) - $($w.MainWindowTitle)"
} else { Write-Output "nao_encontrado" }`;
  return await ps(script, "findWindow");
}

async function listarJanelas() {
  const script = `
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Sort-Object MainWindowTitle |
Select-Object ProcessName, MainWindowTitle, Id |
Format-Table -AutoSize -HideTableHeaders | Out-String | ForEach-Object { $_.Trim() }`;
  return await ps(script, "listWindows");
}

async function minimizarJanela(titulo) {
  const script = `
$w = Get-Process | Where-Object { $_.MainWindowTitle -match "${titulo.replace(/"/g, '""')}" } | Select-Object -First 1
if ($w) {
  Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class Win32 {
      [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    }
"@
  [Win32]::ShowWindow($w.MainWindowHandle, 6)
  Write-Output "ok"
} else { Write-Output "nao_encontrado" }`;
  return await ps(script, "minWindow");
}

async function maximizarJanela(titulo) {
  const script = `
$w = Get-Process | Where-Object { $_.MainWindowTitle -match "${titulo.replace(/"/g, '""')}" } | Select-Object -First 1
if ($w) {
  Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class Win32 {
      [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    }
"@
  [Win32]::ShowWindow($w.MainWindowHandle, 3)
  Write-Output "ok"
} else { Write-Output "nao_encontrado" }`;
  return await ps(script, "maxWindow");
}

async function fecharJanela(titulo) {
  const script = `
$w = Get-Process | Where-Object { $_.MainWindowTitle -match "${titulo.replace(/"/g, '""')}" } | Select-Object -First 1
if ($w) {
  Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class Win32 {
      [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    }
"@
  [Win32]::PostMessage($w.MainWindowHandle, 0x10, [IntPtr]::Zero, [IntPtr]::Zero)
  Write-Output "ok"
} else { Write-Output "nao_encontrado" }`;
  return await ps(script, "closeWindow");
}

// ===================== COMPUTER USE: VISÃO + IA =====================

async function verTela(objetivo = "") {
  const caminho = await screenshot();
  if (!require("fs").existsSync(caminho)) return { erro: "Falha ao capturar tela" };
  const axios = require("axios");
  const fs2 = require("fs");
  const imgBase64 = fs2.readFileSync(caminho, { encoding: "base64" });
  const dataUrl = `data:image/png;base64,${imgBase64}`;
  const prompt = objetivo
    ? `Descreva o que você vê nesta imagem da tela do computador. Foco em: ${objetivo}. Responda em português, seja detalhado sobre posições de elementos, botões, textos.`
    : `Descreva detalhadamente o que você vê nesta imagem da tela do computador. Inclua todos os textos, botões, janelas e elementos visíveis. Responda em português.`;

  // 1. Ollama local (gratuito, sem limites, modelo de visão)
  try {
    const resp = await axios.post("http://localhost:11434/api/generate", {
      model: "minicpm-v",
      prompt,
      images: [imgBase64],
      stream: false,
      options: { temperature: 0.5, num_predict: 1024 },
    }, { timeout: 120000 });
    const descricao = resp?.data?.response;
    if (descricao) return { descricao, caminho };
  } catch { /* fallback */ }

  // 2. OpenRouter (gemma-3-12b-it)
  const { OPENROUTER_API_KEY } = require("./config");
  if (OPENROUTER_API_KEY) {
    try {
      const resp = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        { model: "google/gemma-3-12b-it", max_tokens: 1024, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] }] },
        { timeout: 30000, headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" } }
      );
      const descricao = resp?.data?.choices?.[0]?.message?.content;
      if (descricao) return { descricao, caminho };
    } catch { /* fallback */ }
  }

  // 3. Gemini (fallback final)
  const { GEMINI_API_KEY } = require("./config");
  if (GEMINI_API_KEY && GEMINI_API_KEY !== "coloque_sua_chave_aqui") {
    try {
      const resp = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/png", data: imgBase64 } }] }], generationConfig: { maxOutputTokens: 1024 } },
        { timeout: 20000 }
      );
      const descricao = resp?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (descricao) return { descricao, caminho };
    } catch { /* fallback */ }
  }

  return { erro: "Sem provider de visão disponível", caminho };
}

// ===================== FUNÇÕES EXISTENTES (MANTIDAS) =====================

async function pcInfo() {
  return await ps(fs.readFileSync(path.join(SCRIPTS_DIR, "pcinfo.ps1"), "utf8"), "pcInfo");
}

async function pcInfoJson() {
  const script = [
    '$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1',
    '$mem = Get-CimInstance Win32_OperatingSystem',
    '$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID=\'C:\'"',
    '$temp = Get-CimInstance MSAcpi_ThermalZoneTemperature -Namespace root/wmi -ErrorAction SilentlyContinue | Select-Object -First 1',
    '$json = @{',
    '  cpuNome = if ($cpu) { "$($cpu.Name)" } else { "N/A" }',
    '  cpuUso = if ($cpu) { $cpu.LoadPercentage } else { $null }',
    '  ramTotal = if ($mem) { [math]::Round($mem.TotalVisibleMemorySize / 1MB, 1) } else { $null }',
    '  ramLivre = if ($mem) { [math]::Round($mem.FreePhysicalMemory / 1MB, 1) } else { $null }',
    '  ramUso = if ($mem) { [math]::Round(($mem.TotalVisibleMemorySize - $mem.FreePhysicalMemory) / $mem.TotalVisibleMemorySize * 100, 1) } else { $null }',
    '  discoTotal = if ($disk) { [math]::Round($disk.Size / 1GB, 1) } else { $null }',
    '  discoLivre = if ($disk) { [math]::Round($disk.FreeSpace / 1GB, 1) } else { $null }',
    '  discoUso = if ($disk) { [math]::Round(($disk.Size - $disk.FreeSpace) / $disk.Size * 100, 1) } else { $null }',
    '  temperatura = if ($temp) { [math]::Round(($temp.CurrentTemperature - 2732) / 10, 1) } else { $null }',
    '  temperaturaDisponivel = if ($temp) { $true } else { $false }',
    '}',
    '$json | ConvertTo-Json -Compress',
  ].join("`n");
  const raw = await ps(script, "pcInfoJson");
  return JSON.parse(raw);
}

async function volume(acao, valor) {
  const sendkey = require("./sendkey");
  if (acao === "mute") { sendkey.send(0xAD); return "🔇 Volume mutado/desmutado."; }
  if (acao === "up") { const n = Math.min(parseInt(valor) || 5, 50); for (let i = 0; i < n; i++) sendkey.send(0xAF); return `🔊 Volume aumentado (${n}x).`; }
  if (acao === "down") { const n = Math.min(parseInt(valor) || 5, 50); for (let i = 0; i < n; i++) sendkey.send(0xAE); return `🔉 Volume diminuído (${n}x).`; }
  if (acao === "set") { const n = Math.min(Math.max(parseInt(valor) || 50, 0), 100); sendkey.volume(n); return `🔊 Volume ajustado para ${n}%.`; }
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

async function tts(texto, voz = "auto") {
  try {
    const { falar } = require("./tts");
    await falar(texto, voz);
  } catch {
    const safe = texto.replace(/'/g, "''").replace(/"/g, '""');
    await execAsync(`powershell -NoProfile -Command "(New-Object -ComObject Sapi.SpVoice).Speak('${safe}')"`, { timeout: 15000 }).catch(() => {});
  }
  return `🗣️ Falei: "${texto.slice(0, 100)}"`;
}

async function listarProcessos() {
  const script = `Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 Name, Id, @{N='CPU';E={'{0:N1}' -f $_.CPU}}, @{N='MemMB';E={'{0:N0}' -f ($_.WorkingSet64/1MB)}} | Format-Table -AutoSize | Out-String -Width 200`;
  const out = await ps(script, "listProcess");
  const lines = out.split("\n").slice(3).filter(l => l.trim() && !l.endsWith("----")).slice(0, 15).map(l => l.trim()).join("\n");
  return lines;
}

async function matarProcesso(nome) {
  await ps(`Stop-Process -Name "${nome}" -Force -ErrorAction Stop; Write-Output "ok"`, "killProcess");
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
    1 { "Descarregando" }; 2 { "Carregando" }; 3 { "Completa" }; 4 { "Baixa" }; 5 { "Critica" }; 6 { "Em pausa" }; 7 { "Carregando (alto)" }; 11 { "Conectada" }; default { "Desconhecido" }
  }
  Write-Output "Nivel: $pct%"
  Write-Output "Status: $s"
  if ($bat.EstimatedRunTime -gt 0) { Write-Output "Autonomia: $($bat.EstimatedRunTime) min" }
} else { Write-Output "Sem bateria detectada (PC de mesa?)" }`;
  return await ps(script, "battery");
}

async function notificar(titulo, mensagem) {
  const script = `$popup = New-Object -ComObject wscript.shell; $popup.Popup("${mensagem.replace(/"/g,'""')}", 5, "${titulo.replace(/"/g,'""')}", 64) | Out-Null`;
  try { await ps(script, "notify"); } catch {}
  return `🔔 Notificação enviada: "${titulo}"`;
}

async function enviarEmail(para, assunto, corpo) {
  try {
    await ps(`Send-MailMessage -To "${para}" -Subject "${assunto}" -Body "${corpo}" -SmtpServer "localhost" -From "neon@localhost" -ErrorAction Stop; Write-Output "ok"`, "email");
    return `📧 Email enviado para ${para}.`;
  } catch {
    try {
      const fallback = `powershell -NoProfile -Command "$o = New-Object -ComObject Outlook.Application; $m = $o.CreateItem(0); $m.To = '${para}'; $m.Subject = '${assunto}'; $m.Body = '${corpo}'; $m.Send()"`;
      await execAsync(fallback, { timeout: 10000 });
      return `📧 Email enviado via Outlook para ${para}.`;
    } catch { throw new Error("Não foi possível enviar email. Configure um servidor SMTP ou Outlook."); }
  }
}

module.exports = {
  screenshot, screenshotBase64, pcInfo, pcInfoJson, volume, clipboard, tts,
  listarProcessos, matarProcesso, infoRede, bateria, notificar, enviarEmail,
  moverMouse, clicarMouse, duploClique, arrastar, digitarTexto, tecla,
  acharJanela, listarJanelas, minimizarJanela, maximizarJanela, fecharJanela,
  verTela,
};
