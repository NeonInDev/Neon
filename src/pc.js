const { exec, spawn, execSync } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const execAsync = promisify(exec);

const POINTER_DIR = path.join(process.env.TEMP || "C:\\Temp", "neon_pointer");
const POINTER_CS = path.join(POINTER_DIR, "NeonPointer.cs");
const POINTER_EXE = path.join(POINTER_DIR, "NeonPointer.exe");
const C_POINTER = `
using System;
using System.Globalization;
using System.Runtime.InteropServices;
public class NeonPointer {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  public static void Main() {
    string line;
    while ((line = Console.ReadLine()) != null) {
      if (string.IsNullOrWhiteSpace(line)) continue;
      string[] p = line.Trim().Split(' ');
      int x, y;
      if (p.Length >= 2 &&
          int.TryParse(p[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out x) &&
          int.TryParse(p[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out y))
        SetCursorPos(x, y);
    }
  }
}`;
let pointerProc = null;

function compilarPointer() {
  if (fs.existsSync(POINTER_EXE)) return;
  fs.mkdirSync(POINTER_DIR, { recursive: true });
  fs.writeFileSync(POINTER_CS, C_POINTER, "utf8");
  const cands = [
    path.join(process.env.windir, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
    path.join(process.env.windir, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
  ];
  const csc = cands.find((c) => fs.existsSync(c));
  if (!csc) throw new Error("csc.exe nao encontrado");
  execSync(`"${csc}" /nologo /target:exe /out:"${POINTER_EXE}" "${POINTER_CS}"`, { timeout: 30000, windowsHide: true });
}

function garantirPointer() {
  try {
    compilarPointer();
    if (!pointerProc || pointerProc.exitCode !== null) {
      pointerProc = spawn(POINTER_EXE, [], { stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
    }
  } catch (e) {
    pointerProc = null;
  }
}

const TMP = process.env.TEMP || "C:\\Temp";
const SCRIPTS_DIR = path.join(__dirname, "scripts");
if (!fs.existsSync(SCRIPTS_DIR)) fs.mkdirSync(SCRIPTS_DIR, { recursive: true });

function psEsc(s) {
  return String(s).replace(/['\r\n]/g, (c) => (c === "'" ? "''" : " "));
}

function cmdEsc(s) {
  return String(s).replace(/['"`$&|<>;(){}\\]/g, " ").trim();
}

async function ps(script, label) {
  const tmpFile = path.join(TMP, `neon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.ps1`);
  fs.writeFileSync(tmpFile, script, "utf8");
  try {
    const { stdout, stderr } = await execAsync(`powershell -NoProfile -File "${tmpFile}"`, { timeout: 15000, windowsHide: true });
    if (stderr && !stdout) throw new Error(stderr.trim());
    return stdout.trim() || stderr.trim();
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
  const xi = Math.floor(Number(x)) || 0;
  const yi = Math.floor(Number(y)) || 0;
  garantirPointer();
  if (pointerProc && pointerProc.stdin && pointerProc.stdin.writable) {
    try {
      pointerProc.stdin.write(`${xi} ${yi}\n`);
      return "ok";
    } catch (e) {}
  }
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${xi}, ${yi})
Write-Output "ok"`;
  return await ps(script, "moveMouse");
}

async function clicarMouse(x, y, botao = "left") {
  const btn = botao === "right" ? "Right" : "Left";
  const xi = Math.floor(Number(x)) || 0;
  const yi = Math.floor(Number(y)) || 0;
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${xi}, ${yi})
[System.Windows.Forms.SendKeys]::SendWait("{${btn}}")
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait("{${btn}}")
Write-Output "ok"`;
  return await ps(script, "clickMouse");
}

async function duploClique(x, y) {
  await moverMouse(x, y);
  const xi = Math.floor(Number(x)) || 0;
  const yi = Math.floor(Number(y)) || 0;
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${xi}, ${yi})
[System.Windows.Forms.SendKeys]::SendWait("{Left}")
Start-Sleep -Milliseconds 50
[System.Windows.Forms.SendKeys]::SendWait("{Left}")
Write-Output "ok"`;
  return await ps(script, "doubleClick");
}

async function arrastar(x1, y1, x2, y2) {
  const a = Math.floor(Number(x1)) || 0;
  const b = Math.floor(Number(y1)) || 0;
  const c = Math.floor(Number(x2)) || 0;
  const d = Math.floor(Number(y2)) || 0;
  const script = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${a}, ${b})
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait("{Left}")
$null = [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${c}, ${d})
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait("{Left}")
Write-Output "ok"`;
  return await ps(script, "drag");
}

async function tamanhoTela() {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Output "$($b.Width) $($b.Height)"`;
  const saida = await ps(script, "telaTamanho");
  const [w, h] = (saida || "").split(/\s+/).map(Number);
  return { largura: w || 1920, altura: h || 1080 };
}

async function scroll(delta) {
  const d = Math.floor(Number(delta)) || 0;
  if (d === 0) return "ok";
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class NeonWheel {
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, int dwData, UIntPtr dwExtraInfo);
}
"@
[NeonWheel]::mouse_event(0x0800, 0, 0, ${d}, [UIntPtr]::Zero)
Write-Output "ok"`;
  return await ps(script, "scrollWheel");
}

async function arrastarMeio() {
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class NeonMid {
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, int dwData, UIntPtr dwExtraInfo);
}
"@
[NeonMid]::mouse_event(0x20, 0, 0, 0, [UIntPtr]::Zero)
Write-Output "ok"`;
  return await ps(script, "midDown");
}

async function soltarMeio() {
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class NeonMid {
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, int dwData, UIntPtr dwExtraInfo);
}
"@
[NeonMid]::mouse_event(0x40, 0, 0, 0, [UIntPtr]::Zero)
Write-Output "ok"`;
  return await ps(script, "midUp");
}

// ===================== COMPUTER USE: TECLADO =====================

async function digitarTexto(texto) {
  const safe = texto.replace(/[<>{}()&^%$#@!~`"'|\\\/;:.,?+\-*=\[\] ]/g, ' ').trim();
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${psEsc(safe)}')
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
[System.Windows.Forms.SendKeys]::SendWait('${psEsc(cmd)}')
Write-Output "ok"`;
  return await ps(script, "keyPress");
}

// ===================== COMPUTER USE: JANELAS =====================

async function acharJanela(titulo) {
  const t = psEsc(titulo);
  const script = `
$w = Get-Process | Where-Object { $_.MainWindowTitle -match '${t}' } | Select-Object -First 1
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
  const t = psEsc(titulo);
  const script = `
$w = Get-Process | Where-Object { $_.MainWindowTitle -match '${t}' } | Select-Object -First 1
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
  const t = psEsc(titulo);
  const script = `
$w = Get-Process | Where-Object { $_.MainWindowTitle -match '${t}' } | Select-Object -First 1
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
  const t = psEsc(titulo);
  const script = `
$w = Get-Process | Where-Object { $_.MainWindowTitle -match '${t}' } | Select-Object -First 1
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
  const fs2 = require("fs");
  const imgBase64 = fs2.readFileSync(caminho, { encoding: "base64" });
  const prompt = objetivo
    ? `Descreva o que você vê nesta imagem da tela do computador. Foco em: ${objetivo}. Responda em português, seja detalhado sobre posições de elementos, botões, textos.`
    : `Descreva detalhadamente o que você vê nesta imagem da tela do computador. Inclua todos os textos, botões, janelas e elementos visíveis. Responda em português.`;

  const visao = require("./visao");
  const resultado = await visao.analisarImagem(imgBase64, prompt);
  if (resultado?.erro) return { erro: resultado.erro, caminho };
  return { descricao: resultado.descricao, caminho, modelo: resultado.modelo };
}

async function analisarImagem(base64, prompt = "Descreva detalhadamente o que você vê nesta imagem. Responda em português.") {
  const visao = require("./visao");
  return visao.analisarImagem(base64, prompt);
}

// ===================== FUNÇÕES EXISTENTES (MANTIDAS) =====================

async function pcInfo() {
  const script = [
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'namespace Neon {',
    'public static class Native {',
    '  [DllImport(\"kernel32.dll\")] public static extern bool GetSystemTimes(out long idle, out long kernel, out long user);',
    '  [DllImport(\"kernel32.dll\")] public static extern ulong GetTickCount64();',
    '  [DllImport(\"kernel32.dll\")] public static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);',
    '}',
    '[StructLayout(LayoutKind.Sequential)]',
    'public struct MEMORYSTATUSEX {',
    '  public uint dwLength; public uint dwMemoryLoad; public ulong ullTotalPhys; public ulong ullAvailPhys;',
    '  public ulong ullTotalPageFile; public ulong ullAvailPageFile; public ulong ullTotalVirtual; public ulong ullAvailVirtual;',
    '  public ulong ullAvailExtendedVirtual;',
    '}',
    '}',
    '"@',
    '$i1=0; $k1=0; $u1=0; $null = [Neon.Native]::GetSystemTimes([ref]$i1,[ref]$k1,[ref]$u1)',
    'Start-Sleep -Milliseconds 500',
    '$i2=0; $k2=0; $u2=0; $null = [Neon.Native]::GetSystemTimes([ref]$i2,[ref]$k2,[ref]$u2)',
    '$total = ($k2-$k1) + ($u2-$u1)',
    '$cpu = if ($total -gt 0) { [math]::Round((($total - ($i2-$i1)) / $total) * 100) } else { 0 }',
    '$mem = New-Object Neon.MEMORYSTATUSEX',
    '$mem.dwLength = [System.Runtime.InteropServices.Marshal]::SizeOf([type][Neon.MEMORYSTATUSEX])',
    '$null = [Neon.Native]::GlobalMemoryStatusEx([ref]$mem)',
    '$ramPct = if ($mem.ullTotalPhys -gt 0) { [math]::Round(($mem.ullTotalPhys - $mem.ullAvailPhys) / $mem.ullTotalPhys * 100) } else { 0 }',
    '$ramStr = "$([math]::Round(($mem.ullTotalPhys - $mem.ullAvailPhys)/1GB))/$([math]::Round($mem.ullTotalPhys/1GB)) GB"',
    '$ts = [TimeSpan]::FromMilliseconds([Neon.Native]::GetTickCount64())',
    '$cpuNome = (Get-ItemProperty "HKLM:\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0" -ErrorAction SilentlyContinue).ProcessorNameString',
    '$disk = Get-PSDrive C -ErrorAction SilentlyContinue',
    '$hostname = $env:COMPUTERNAME',
    'Write-Output "== Sistema =="',
    'Write-Output "PC: ${hostname}"',
    'Write-Output "CPU: ${cpuNome}"',
    'Write-Output "OS: $([System.Environment]::OSVersion.VersionString)"',
    'Write-Output "Uptime: $([math]::Floor($ts.TotalDays))d $($ts.Hours)h $($ts.Minutes)min"',
    'Write-Output ""',
    'Write-Output "== Hardware =="',
    'Write-Output "CPU: ${cpu}%"',
    'Write-Output "RAM: ${ramPct}% (${ramStr})"',
    'if ($disk) { Write-Output "Disco C: usado $([math]::Round($disk.Used/1GB)) GB / livre $([math]::Round($disk.Free/1GB)) GB" }',
  ].join("\n");
  return await ps(script, "pcInfo");
}

async function pcInfoJson() {
  const script = [
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'namespace Neon {',
    'public static class Native {',
    '  [DllImport(\"kernel32.dll\")] public static extern bool GetSystemTimes(out long idle, out long kernel, out long user);',
    '  [DllImport(\"kernel32.dll\")] public static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);',
    '}',
    '[StructLayout(LayoutKind.Sequential)]',
    'public struct MEMORYSTATUSEX {',
    '  public uint dwLength; public uint dwMemoryLoad; public ulong ullTotalPhys; public ulong ullAvailPhys;',
    '  public ulong ullTotalPageFile; public ulong ullAvailPageFile; public ulong ullTotalVirtual; public ulong ullAvailVirtual;',
    '  public ulong ullAvailExtendedVirtual;',
    '}',
    '}',
    '"@',
    '$i1=0; $k1=0; $u1=0; $null = [Neon.Native]::GetSystemTimes([ref]$i1,[ref]$k1,[ref]$u1)',
    'Start-Sleep -Milliseconds 500',
    '$i2=0; $k2=0; $u2=0; $null = [Neon.Native]::GetSystemTimes([ref]$i2,[ref]$k2,[ref]$u2)',
    '$total = ($k2-$k1) + ($u2-$u1)',
    '$cpuUso = if ($total -gt 0) { [math]::Round((($total - ($i2-$i1)) / $total) * 100, 1) } else { $null }',
    '$mem = New-Object Neon.MEMORYSTATUSEX',
    '$mem.dwLength = [System.Runtime.InteropServices.Marshal]::SizeOf([type][Neon.MEMORYSTATUSEX])',
    '$null = [Neon.Native]::GlobalMemoryStatusEx([ref]$mem)',
    '$ramTotal = if ($mem.ullTotalPhys -gt 0) { [math]::Round($mem.ullTotalPhys / 1GB, 1) } else { $null }',
    '$ramLivre = if ($mem.ullTotalPhys -gt 0) { [math]::Round($mem.ullAvailPhys / 1GB, 1) } else { $null }',
    '$ramUso = if ($mem.ullTotalPhys -gt 0) { [math]::Round(($mem.ullTotalPhys - $mem.ullAvailPhys) / $mem.ullTotalPhys * 100, 1) } else { $null }',
    '$cpuNome = (Get-ItemProperty "HKLM:\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0" -ErrorAction SilentlyContinue).ProcessorNameString',
    '$disk = Get-PSDrive C -ErrorAction SilentlyContinue',
    '$json = @{',
    '  cpuNome = if ($cpuNome) { "$cpuNome" } else { "N/A" }',
    '  cpuUso = if ($null -ne $cpuUso) { $cpuUso } else { $null }',
    '  ramTotal = $ramTotal',
    '  ramLivre = $ramLivre',
    '  ramUso = $ramUso',
    '  discoTotal = if ($disk) { [math]::Round(($disk.Used + $disk.Free) / 1GB, 1) } else { $null }',
    '  discoLivre = if ($disk) { [math]::Round($disk.Free / 1GB, 1) } else { $null }',
    '  discoUso = if ($disk -and ($disk.Used + $disk.Free) -gt 0) { [math]::Round($disk.Used / ($disk.Used + $disk.Free) * 100, 1) } else { $null }',
    '  temperatura = $null',
    '  temperaturaGpu = $null',
    '  temperaturaDisponivel = $false',
    '}',
    'try {',
    '  # 1) Tenta MSI Afterburner (shared memory MAHMSharedMemory) - sem driver extra',
    '  $mmf = $null; $stream = $null; $reader = $null',
    '  try {',
    '    $mmf = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting("MAHMSharedMemory")',
    '    $stream = $mmf.CreateViewStream()',
    '    $reader = New-Object System.IO.BinaryReader($stream)',
    '    $null = $reader.ReadUInt32() # sig',
    '    $null = $reader.ReadUInt32() # version',
    '    $hdrSize = $reader.ReadUInt32()',
    '    $numEntries = $reader.ReadUInt32()',
    '    $entrySize = $reader.ReadUInt32()',
    '    if ($hdrSize -eq 0) { $hdrSize = 32 }',
    '    if ($entrySize -eq 0) { $entrySize = 1324 }',
    '    $cpuT = $null; $gpuT = $null',
    '    for ($i = 0; $i -lt $numEntries; $i++) {',
    '      $stream.Position = $hdrSize + ($i * $entrySize)',
    '      $null = $reader.ReadBytes(1300) # pula nomes (5 x 260)',
    '      $data = $reader.ReadSingle()',
    '      $null = $reader.ReadSingle() # minLimit',
    '      $null = $reader.ReadSingle() # maxLimit',
    '      $null = $reader.ReadUInt32() # flags',
    '      $null = $reader.ReadUInt32() # gpu idx',
    '      $srcId = $reader.ReadUInt32()',
    '      if ($data -eq [float]::MaxValue) { continue }',
    '      if ($srcId -eq 0x00000080 -and $null -eq $cpuT) { $cpuT = $data }',
    '      if ($srcId -eq 0x00000000 -and $null -eq $gpuT) { $gpuT = $data }',
    '    }',
    '    if ($null -ne $cpuT) { $json.temperatura = [math]::Round($cpuT, 1); $json.temperaturaDisponivel = $true }',
    '    if ($null -ne $gpuT) { $json.temperaturaGpu = [math]::Round($gpuT, 1) }',
    '    if ($null -ne $reader) { $reader.Close() }',
    '    if ($null -ne $stream) { $stream.Dispose() }',
    '    if ($null -ne $mmf) { $mmf.Dispose() }',
    '  } catch {}',
    '  # 2) Fallback: LibreHardwareMonitor',
    '  $lhm = "C:\\Users\\Pichau\\neon\\libs\\librehardwaremonitor\\LibreHardwareMonitorLib.dll"',
    '  if (Test-Path $lhm) {',
    '    Add-Type -Path $lhm -ErrorAction Stop',
    '    $comp = New-Object LibreHardwareMonitor.Hardware.Computer',
    '    $comp.IsCpuEnabled = $true',
    '    $comp.IsGpuEnabled = $true',
    '    $comp.IsMotherboardEnabled = $true',
    '    $comp.IsMemoryEnabled = $false',
    '    $comp.Open()',
    '    $comp.Accept([LibreHardwareMonitor.Hardware.SensorVisitor]::new())',
    '    $temps = @()',
    '    foreach ($hw in $comp.Hardware) {',
    '      $hw.Update()',
    '      $hw.Hardware | ForEach-Object { $_.Update() }',
    '      foreach ($s in $hw.Sensors) {',
    '        if ($s.SensorType -eq [LibreHardwareMonitor.Hardware.SensorType]::Temperature -and $s.Value.HasValue) {',
    '          $temps += [pscustomobject]@{ Nome = $s.Name; Valor = [math]::Round($s.Value.Value, 1) }',
    '        }',
    '      }',
    '      foreach ($sub in $hw.Hardware) {',
    '        foreach ($s in $sub.Sensors) {',
    '          if ($s.SensorType -eq [LibreHardwareMonitor.Hardware.SensorType]::Temperature -and $s.Value.HasValue) {',
    '            $temps += [pscustomobject]@{ Nome = $s.Name; Valor = [math]::Round($s.Value.Value, 1) }',
    '          }',
    '        }',
    '      }',
    '    }',
    '    $comp.Close()',
    '    if ($temps.Count -gt 0) {',
    '      $json.temperatura = ($temps | Sort-Object Valor -Descending | Select-Object -First 1).Valor',
    '      $json.temperaturaDisponivel = $true',
    '    }',
    '  }',
    '} catch {}',
    '$json | ConvertTo-Json -Compress',
  ].join("\n");
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
    await execAsync(`powershell -NoProfile -Command "Set-Clipboard -Value '${cmdEsc(texto)}'"`, { timeout: 5000, windowsHide: true });
    return `📋 Copiado: "${texto.slice(0, 100)}"`;
  }
  if (acao === "colar") {
    const { stdout } = await execAsync(`powershell -NoProfile -Command "Get-Clipboard"`, { timeout: 5000, windowsHide: true });
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
    const safe = cmdEsc(texto);
    await execAsync(`powershell -NoProfile -Command "(New-Object -ComObject Sapi.SpVoice).Speak('${safe}')"`, { timeout: 15000, windowsHide: true }).catch(() => {});
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
  await ps(`Stop-Process -Name '${psEsc(nome)}' -Force -ErrorAction Stop; Write-Output "ok"`, "killProcess");
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
  const script = `Add-Type -AssemblyName System.Windows.Forms
$ps = [System.Windows.Forms.SystemInformation]::PowerStatus
if ([int]$ps.BatteryChargeStatus -eq 128 -or $ps.BatteryLifePercent -lt 0) {
  Write-Output "Sem bateria detectada (PC de mesa?)"
} else {
  $pct = [int][math]::Round($ps.BatteryLifePercent * 100)
  $s = if ($ps.PowerLineStatus -eq 1) { "Carregando (conectado)" } else { "Descarregando (na bateria)" }
  Write-Output "Nivel: $pct%"
  Write-Output "Status: $s"
  if ($ps.BatteryLifeRemaining -gt 0) { Write-Output "Autonomia: $([int]($ps.BatteryLifeRemaining / 60)) min" }
}`;
  return await ps(script, "battery");
}

async function bateriaJson() {
  const script = `Add-Type -AssemblyName System.Windows.Forms
$ps = [System.Windows.Forms.SystemInformation]::PowerStatus
if ([int]$ps.BatteryChargeStatus -eq 128 -or $ps.BatteryLifePercent -lt 0) {
  Write-Output '{"temBateria":false}'
} else {
  $obj = @{ temBateria = $true; pct = [int][math]::Round($ps.BatteryLifePercent * 100); status = if ($ps.PowerLineStatus -eq 1) { "carregando" } else { "descarregando" } }
  $obj | ConvertTo-Json -Compress
}`;
  return JSON.parse(await ps(script, "batteryJson"));
}

async function notificarToast(titulo, mensagem) {
  const t = psEsc(titulo);
  const m = psEsc(mensagem);
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon("$env:windir\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
$n.BalloonTipTitle = '${t}'
$n.BalloonTipText = '${m}'
$n.Visible = $true
$n.ShowBalloonTip(5000)
Start-Sleep -Seconds 6
$n.Dispose()`;
  try { await ps(script, "toast"); } catch {
    const fallback = `$popup = New-Object -ComObject wscript.shell; $popup.Popup('${m}', 5, '${t}', 64) | Out-Null`;
    await ps(fallback, "notify").catch(() => {});
  }
  return `🔔 Notificação enviada: "${titulo}"`;
}

async function notificar(titulo, mensagem) {
  return await notificarToast(titulo, mensagem);
}

async function enviarEmail(para, assunto, corpo) {
  try {
    await ps(`Send-MailMessage -To '${psEsc(para)}' -Subject '${psEsc(assunto)}' -Body '${psEsc(corpo)}' -SmtpServer "localhost" -From "neon@localhost" -ErrorAction Stop; Write-Output "ok"`, "email");
    return `📧 Email enviado para ${para}.`;
  } catch {
    try {
      const fallback = `powershell -NoProfile -Command "$o = New-Object -ComObject Outlook.Application; $m = $o.CreateItem(0); $m.To = '${cmdEsc(para)}'; $m.Subject = '${cmdEsc(assunto)}'; $m.Body = '${cmdEsc(corpo)}'; $m.Send()"`;
      await execAsync(fallback, { timeout: 10000, windowsHide: true });
      return `📧 Email enviado via Outlook para ${para}.`;
    } catch { throw new Error("Não foi possível enviar email. Configure um servidor SMTP ou Outlook."); }
  }
}

// ===================== CONTROLES RÁPIDOS =====================

async function dormir() {
  try {
    await execAsync(`powershell -NoProfile -Command "(Add-Type -AssemblyName System.Windows.Forms -PassThru).Wait()"`, { timeout: 5000, windowsHide: true });
  } catch {}
  await execAsync(`rundll32.exe powrprof.dll,SetSuspendState 0,1,0`, { timeout: 5000, windowsHide: true }).catch(() => {});
  return "💤 Coloquei o PC pra dormir.";
}

async function bloquear() {
  try {
    await execAsync(`powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).Windows() | Out-Null"`, { timeout: 5000, windowsHide: true });
  } catch {}
  await execAsync(`rundll32.exe user32.dll,LockWorkStation`, { timeout: 5000, windowsHide: true }).catch(() => {});
  return "🔒 PC bloqueado.";
}

async function desligar() {
  await execAsync(`shutdown /s /t 5 /c "Neon desligou o PC"`, { timeout: 5000, windowsHide: true }).catch(() => {});
  return "🔌 Desligando o PC em 5 segundos...";
}

async function cancelarDesligar() {
  await execAsync(`shutdown /a`, { timeout: 5000, windowsHide: true }).catch(() => {});
  return "✅ Desligamento cancelado.";
}

async function abrirAppPorNome(nome) {
  const alvo = String(nome || "").trim();
  if (!alvo || /[\r\n]/.test(alvo)) {
    return { ok: false, erro: `Nome de aplicativo inválido` };
  }
  if (/^(?:whatsapp|whats|zap|zapzap)$/i.test(alvo)) {
    return { ok: false, erro: "WhatsApp só pode ser aberto pelo comando explícito do WhatsApp." };
  }

  const psAlvo = alvo.replace(/'/g, "''");
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$ErrorActionPreference = 'Stop'; Start-Process -FilePath '${psAlvo}'`,
    ], {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let erro = "";
    child.stderr.on("data", (data) => { erro += data.toString(); });
    child.on("error", () => resolve({ ok: false, erro: `Não consegui abrir ${alvo}` }));
    child.on("close", (codigo) => {
      if (codigo === 0) {
        resolve({ ok: true, mensagem: `Abrindo ${alvo}.` });
      } else {
        resolve({ ok: false, erro: erro.trim().slice(0, 250) || `Não consegui abrir ${alvo}` });
      }
    });
  });
}

function caminhoSeguro(caminho) {
  const bruto = String(caminho || "").trim();
  if (!bruto || /[\r\n]/.test(bruto)) throw new Error("Caminho inválido");
  const raiz = path.resolve(process.env.USERPROFILE || "C:\\Users\\Pichau");
  const base = path.join(raiz, "Documents");
  const alvo = path.resolve(path.isAbsolute(bruto) ? raiz : base, bruto);
  const relativo = path.relative(raiz, alvo);
  if (relativo.startsWith("..") || path.isAbsolute(relativo)) throw new Error("Caminho fora da pasta autorizada");
  if (/(^|\\)\.whatsapp(\\|$)|(^|\\)(?:\.env|.*token.*|.*credential.*)$/i.test(relativo)) {
    throw new Error("Arquivo protegido");
  }
  return alvo;
}

async function criarArquivo(caminho, conteudo = "") {
  const alvo = caminhoSeguro(caminho);
  const texto = String(conteudo);
  if (Buffer.byteLength(texto, "utf8") > 5 * 1024 * 1024) {
    return { ok: false, erro: "Arquivo excede o limite de 5 MB" };
  }
  if (fs.existsSync(alvo)) {
    return { ok: false, erro: "Arquivo já existe; não sobrescrevi nada" };
  }
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, texto, "utf8");
  return { ok: true, caminho: alvo, bytes: Buffer.byteLength(texto, "utf8"), mensagem: `Arquivo criado em ${alvo}.` };
}

async function resumoCommits(limite = 8) {
  const n = Math.min(Math.max(parseInt(limite, 10) || 8, 1), 20);
  const repositorio = path.join(__dirname, "..");
  const { stdout } = await execAsync(
    `git -C "${repositorio}" log -${n} --pretty=format:"%h | %ad | %s" --date=format:"%d/%m/%Y %H:%M"`,
    { timeout: 10000, windowsHide: true, maxBuffer: 100000 }
  );
  return { ok: true, commits: stdout.trim() || "Nenhum commit encontrado." };
}

async function abrirWhatsApp() {
  await execAsync(
    `powershell -NoProfile -Command "Start-Process -FilePath 'whatsapp:'"`,
    { timeout: 10000, windowsHide: true }
  );
  return { ok: true, mensagem: "Abrindo o WhatsApp porque você pediu." };
}

async function abrirUrl(url) {
  const alvo = String(url || "").trim();
  if (!/^https?:\/\/\S+$/i.test(alvo) || /[\r\n]/.test(alvo)) {
    return { ok: false, erro: "URL inválida" };
  }
  const psUrl = alvo.replace(/'/g, "''");
  await execAsync(
    `powershell -NoProfile -Command "Start-Process -FilePath '${psUrl}'"`,
    { timeout: 10000, windowsHide: true }
  );
  return { ok: true, mensagem: `Abrindo ${alvo} no navegador.` };
}

async function iniciarJogoSteam(appid) {
  const id = String(appid || "").trim();
  if (!/^\d+$/.test(id)) return { ok: false, erro: "AppID da Steam inválido" };
  const uri = `steam://rungameid/${id}`;
  await execAsync(
    `powershell -NoProfile -Command "Start-Process -FilePath '${uri}'"`,
    { timeout: 10000, windowsHide: true }
  );
  return { ok: true, mensagem: `Iniciando o jogo da Steam (AppID ${id}).` };
}

async function fecharAppsExceto() {
  const script = `
$preservar = @('medal', 'steam', 'code', 'node', 'opencode', 'explorer', 'powershell', 'conhost', 'cmd', 'dwm')
$alvos = Get-Process | Where-Object {
  $_.MainWindowHandle -ne 0 -and
  $_.ProcessName.ToLower() -notin $preservar -and
  $_.Id -ne $PID
}
$fechados = @()
foreach ($p in $alvos) {
  try {
    if ($p.CloseMainWindow()) {
      $fechados += $p.ProcessName
    }
  } catch {}
}
Start-Sleep -Milliseconds 1200
($fechados | Sort-Object -Unique) -join ','
`;
  const resultado = await ps(script, "closeAppsExcept");
  return {
    ok: true,
    mensagem: resultado ? `Fechei: ${resultado}.` : "Não havia outros aplicativos com janela para fechar.",
  };
}

async function spotifyBuscarTocar(busca) {
  const consulta = String(busca || "").trim();
  if (!consulta || /[\r\n]/.test(consulta)) {
    return { ok: false, erro: "Busca do Spotify inválida" };
  }
  const id = consulta.match(/(?:spotify:track:|open\.spotify\.com\/track\/)([A-Za-z0-9]{22})/)?.[1] || ( /^[A-Za-z0-9]{22}$/.test(consulta) ? consulta : null);
  if (id) return spotifyTocarPorId(id);

  const uri = `spotify:search:${encodeURIComponent(consulta)}`;
  const psUri = uri.replace(/'/g, "''");
  await execAsync(
    `powershell -NoProfile -Command "Start-Process -FilePath '${psUri}'"`,
    { timeout: 10000, windowsHide: true }
  );

  await new Promise((resolve) => setTimeout(resolve, 1800));
  const sendkey = require("./sendkey");
  sendkey.focusJanela("Spotify");
  await new Promise((resolve) => setTimeout(resolve, 300));
  sendkey.sendKey("{ENTER}", "Spotify");
  return { ok: true, mensagem: `Buscando e tentando tocar "${consulta}" no Spotify.` };
}

async function spotifyTocarPorId(trackId) {
  const id = String(trackId || "").trim().match(/(?:spotify:track:|open\.spotify\.com\/track\/)?([A-Za-z0-9]{22})$/)?.[1];
  if (!id) return { ok: false, erro: "ID de faixa do Spotify inválido" };
  const uri = `spotify:track:${id}`;
  await execAsync(
    `powershell -NoProfile -Command "Start-Process -FilePath '${uri}'"`,
    { timeout: 10000, windowsHide: true }
  );
  await new Promise((resolve) => setTimeout(resolve, 2200));
  const sendkey = require("./sendkey");
  if (!sendkey.focusJanela("Spotify")) {
    return { ok: false, erro: "Spotify não está com uma janela disponível" };
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  sendkey.sendKey("{ENTER}", "Spotify");
  return { ok: true, mensagem: `Tocando a faixa do Spotify (${id}).` };
}

async function spotifyControle(acao) {
  const comandos = {
    tocar: "PLAY_PAUSE",
    pausar: "PLAY_PAUSE",
    continuar: "PLAY_PAUSE",
    proxima: "NEXT",
    anterior: "PREV",
  };
  const comando = comandos[String(acao || "").toLowerCase().trim()];
  if (!comando) {
    return { ok: false, erro: "Ação do Spotify inválida. Use tocar, pausar, continuar, proxima ou anterior." };
  }

  const sendkey = require("./sendkey");
  const enviado = sendkey.send(sendkey.VK[comando]);
  return enviado
    ? { ok: true, mensagem: `Comando "${acao}" enviado ao Spotify.` }
    : { ok: false, erro: `Não consegui enviar o comando "${acao}" ao Spotify.` };
}

module.exports = {
  screenshot, screenshotBase64, pcInfo, pcInfoJson, volume, clipboard, tts,
  listarProcessos, matarProcesso, infoRede, bateria, bateriaJson, notificar, notificarToast, enviarEmail,
  dormir, bloquear, desligar, cancelarDesligar, abrirAppPorNome, criarArquivo, resumoCommits, abrirWhatsApp, abrirUrl,
  iniciarJogoSteam, fecharAppsExceto, spotifyBuscarTocar, spotifyTocarPorId, spotifyControle,
  moverMouse, clicarMouse, duploClique, arrastar, arrastarMeio, soltarMeio, digitarTexto, tecla,
  acharJanela, listarJanelas, minimizarJanela, maximizarJanela, fecharJanela,
  tamanhoTela, scroll,
  verTela, analisarImagem,
};
