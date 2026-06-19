#Requires -Version 5.1
$ErrorActionPreference = "Continue"
$Host.UI.RawUI.WindowTitle = "Neon Installer"
$installStart = Get-Date

$REPO_URL   = "https://github.com/NeonInDev/Neon"
$DESTINO    = Join-Path $env:USERPROFILE "Neon"
$FFMPEG_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$LOG_FILE   = Join-Path $env:USERPROFILE "Desktop\neon_install_log.txt"

function logMSG {
  param($msg, $color = "White")
  $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
  Add-Content -Path $LOG_FILE -Value $line
  Write-Host $msg -ForegroundColor $color
}

function step {
  param($num, $total, $msg)
  $pct = [math]::Round($num / $total * 100)
  Write-Progress -Activity "Instalando Neon" -Status "Passo $num de $total" -CurrentOperation $msg -PercentComplete $pct
  logMSG "[$num/$total] $msg" -color "Yellow"
}

function runWinget {
  param($name, $wingetId)
  logMSG "  Instalando $name via winget (pode levar minutos)..." -color "Gray"
  $output = & winget install $wingetId --silent --accept-package-agreements 2>&1
  $exitCode = $LASTEXITCODE
  $output | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  if ($exitCode -eq 0) { logMSG "  [OK] $name instalado" -color "Green"; return $true }
  logMSG "  [!] winget $name falhou (codigo $exitCode)" -color "Yellow"
  return $false
}

Add-Content -Path $LOG_FILE -Value "=== Neon Installer $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
logMSG "+------------------------------------------+" -color "Cyan"
logMSG "|         NEON INSTALLER v2.1              |" -color "Cyan"
logMSG "|     Instala tudo pra rodar a Neon        |" -color "Cyan"
logMSG "+------------------------------------------+" -color "Cyan"
logMSG ""

# -- Internet --
step -num 0 -total 9 -msg "Verificando internet..."
try {
  $test = Invoke-WebRequest -Uri "https://github.com" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
  logMSG "  [OK] Internet disponivel" -color "Green"
} catch {
  logMSG "  [FALHA] Sem internet! Verifique a conexao." -color "Red"
  pause; exit 1
}

# -- 1. Winget --
step -num 1 -total 9 -msg "Winget"
$winget = Get-Command "winget" -ErrorAction SilentlyContinue
if ($winget) { logMSG "  [OK] winget disponivel" -color "Green" }
else { logMSG "  [!] winget nao encontrado (algumas instalacoes podem falhar)" -color "Yellow" }

# -- 2. Git --
step -num 2 -total 9 -msg "Git"
$gitPath = (Get-Command "git" -ErrorAction SilentlyContinue).Source
if (-not $gitPath -and $winget) {
  $ok = runWinget "Git" "Git.Git"
  if (-not $ok) {
    logMSG "  Tente instalar manualmente: winget install Git.Git" -color "Yellow"
  }
} elseif ($gitPath) { logMSG "  [OK] Git encontrado" -color "Green" }
else { logMSG "  [FALHA] Git necessario. Instale: winget install Git.Git" -color "Red" }

# -- 3. Node.js --
step -num 3 -total 9 -msg "Node.js"
$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  if ($winget) {
    $ok = runWinget "Node.js" "OpenJS.NodeJS.LTS"
    $nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
  }
  if (-not $nodeCmd) {
    logMSG "  Baixando Node.js portatil..." -color "Gray"
    try {
      $nodeVer = "22.14.0"
      $nodeUrl = "https://nodejs.org/dist/v$nodeVer/node-v$nodeVer-win-x64.zip"
      $zipPath = Join-Path $env:TEMP "node.zip"
      logMSG "  Download de $nodeUrl ..." -color "Gray"
      Invoke-WebRequest -Uri $nodeUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 120
      $destNode = Join-Path $DESTINO "node"
      Expand-Archive -Path $zipPath -DestinationPath $destNode -Force
      $env:PATH = "$(Join-Path $destNode "node-v$nodeVer-win-x64");$env:PATH"
      logMSG "  [OK] Node.js $nodeVer em $destNode" -color "Green"
    } catch { logMSG "  [FALHA] Node.js: $_" -color "Red"; pause; exit 1 }
  }
} else {
  $v = & node --version
  logMSG "  [OK] Node.js $v" -color "Green"
}

# -- 4. VS Code --
step -num 4 -total 9 -msg "VS Code (opcional)"
$codeCmd = Get-Command "code" -ErrorAction SilentlyContinue
if (-not $codeCmd -and $winget) {
  runWinget "VS Code" "Microsoft.VisualStudioCode"
  $codeCmd = Get-Command "code" -ErrorAction SilentlyContinue
}
if ($codeCmd) { logMSG "  [OK] VS Code encontrado" -color "Green" }
else { logMSG "  [-] VS Code nao instalado (opcional)" -color "Gray" }

# -- 5. Blender --
step -num 5 -total 9 -msg "Blender (opcional)"
$blenderFound = $false
$blenderPaths = @("$env:ProgramFiles\Blender Foundation\*\blender.exe", "${env:ProgramFiles(x86)}\Blender Foundation\*\blender.exe", "$env:LOCALAPPDATA\Blender Foundation\*\blender.exe")
foreach ($p in $blenderPaths) { if (Get-ChildItem $p -ErrorAction SilentlyContinue) { $blenderFound = $true; break } }
if (-not $blenderFound) { $blenderFound = (Get-Command "blender" -ErrorAction SilentlyContinue).Source }
if (-not $blenderFound) {
  logMSG "  Deseja instalar Blender? [S/N]" -color "White"
  $key = [Console]::ReadKey($true).KeyChar
  if ($key -eq 's' -or $key -eq 'S') { runWinget "Blender" "BlenderFoundation.Blender" }
  else { logMSG "  [-] Pulando Blender" -color "Gray" }
} else { logMSG "  [OK] Blender encontrado" -color "Green" }

# -- 6. FFmpeg --
step -num 6 -total 9 -msg "FFmpeg"
if (-not (Test-Path "C:\ffmpeg\ffmpeg.exe")) {
  logMSG "  Baixando FFmpeg (pode levar minutos)..." -color "Gray"
  try {
    $zipPath = Join-Path $env:TEMP "ffmpeg.zip"
    Invoke-WebRequest -Uri $FFMPEG_URL -OutFile $zipPath -UseBasicParsing -TimeoutSec 180
    $tmpDir = Join-Path $env:TEMP "ffmpeg_tmp"
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
    Expand-Archive -Path $zipPath -DestinationPath $tmpDir -Force
    $exe = Get-ChildItem $tmpDir -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
    if ($exe) {
      New-Item -ItemType Directory -Path "C:\ffmpeg" -Force | Out-Null
      Copy-Item -Path "$($exe.Directory.FullName)\*" -Destination "C:\ffmpeg" -Recurse -Force
      $oldPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
      if ($oldPath -notlike "*C:\ffmpeg*") {
        [Environment]::SetEnvironmentVariable("Path", "$oldPath;C:\ffmpeg", "Machine")
      }
      logMSG "  [OK] FFmpeg em C:\ffmpeg" -color "Green"
    }
    Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
  } catch { logMSG "  [!] Falha FFmpeg: $_" -color "Yellow" }
} else { logMSG "  [OK] FFmpeg ja instalado" -color "Green" }

# -- 7. Clonar --
step -num 7 -total 9 -msg "Clonando repositório"
if (Test-Path (Join-Path $DESTINO "index.js")) {
  logMSG "  Repositorio ja existe. Atualizando..." -color "Gray"
  Push-Location $DESTINO
  try { & git pull --ff-only 2>&1 | Out-Null; logMSG "  [OK] Atualizado" -color "Green" } catch { logMSG "  [!] git pull falhou: $_" -color "Yellow" }
  Pop-Location
} else {
  try { & git clone $REPO_URL $DESTINO 2>&1; logMSG "  [OK] Clonado" -color "Green" }
  catch { logMSG "  [FALHA] git clone: $_" -color "Red"; pause; exit 1 }
}

# -- 8. Dependencias --
step -num 8 -total 9 -msg "Instalando dependencias"
Push-Location $DESTINO
try { & npm install --production 2>&1 | Out-Null; logMSG "  [OK] npm install" -color "Green" } catch { logMSG "  [!] npm falhou: $_" -color "Yellow" }
try {
  $oc = Get-Command "opencode" -ErrorAction SilentlyContinue
  if (-not $oc) { & npm install -g opencode-ai 2>&1 | Out-Null; logMSG "  [OK] Opencode global" -color "Green" }
  else { logMSG "  [OK] Opencode ja instalado" -color "Green" }
} catch { logMSG "  [!] Opencode falhou: $_" -color "Yellow" }
Pop-Location

# -- 9. Atalhos --
step -num 9 -total 9 -msg "Criando atalhos"
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$iniciarBat = Join-Path $DESTINO "iniciar_neon.bat"
if (-not (Test-Path $iniciarBat)) {
@"
@echo off
title Neon - Assistente IA
fltmc >nul 2>&1 || (
    powershell -Command "Start-Process -Verb RunAs -FilePath '%~f0' -WorkingDirectory '%~dp0'"
    exit /b
)
cd /d "%~dp0"
:MENU
cls
echo.
echo ========================================
echo         NEON - Assistente Pessoal
echo ========================================
echo.
if not exist ".env" (
    echo [AVISO] .env nao encontrado
    echo Crie o arquivo com DISCORD_TOKEN e GEMINI_API_KEY
    pause
)
echo [INICIANDO NEON...]
echo.
where node >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado!
    pause
    exit /b 1
)
node index.js
if errorlevel 1 pause
goto MENU
"@ | Set-Content -Path $iniciarBat -Encoding ASCII
}
$lnk = $shell.CreateShortcut((Join-Path $desktop "Neon.lnk"))
$lnk.TargetPath = "cmd.exe"
$lnk.Arguments = "/c `"$iniciarBat`""
$lnk.WorkingDirectory = $DESTINO
$lnk.WindowStyle = 1
$lnk.Description = "Iniciar Neon"
$lnk.Save()
$lnk2 = $shell.CreateShortcut((Join-Path $desktop "Neon - Documentacao.lnk"))
$lnk2.TargetPath = "http://localhost:3000"
$lnk2.Description = "Neon Docs"
$lnk2.Save()
& git -C $DESTINO remote set-url --push origin http://nopush.invalid 2>&1 | Out-Null
logMSG "  [OK] Atalhos criados" -color "Green"

Write-Progress -Activity "Instalando Neon" -Completed
$elapsed = [math]::Round(((Get-Date) - $installStart).TotalSeconds)
logMSG ""
logMSG "+------------------------------------------+" -color "Cyan"
logMSG "|       INSTALACAO CONCLUIDA!              |" -color "Cyan"
logMSG "|   Tempo total: ${elapsed}s               |" -color "Cyan"
logMSG "+------------------------------------------+" -color "Cyan"
logMSG ""
logMSG "  Neon: atalho na Area de Trabalho" -color "White"
logMSG "  Docs: http://localhost:3000" -color "White"
logMSG "  Log:  $LOG_FILE" -color "DarkGray"
logMSG ""

try {
  $popup = New-Object -ComObject wscript.shell
  $popup.Popup("Neon instalada com sucesso! ($elapsed segundos)", 10, "Neon Installer", 64)
} catch {}

pause
