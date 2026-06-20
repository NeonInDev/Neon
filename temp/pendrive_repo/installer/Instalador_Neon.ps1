#Requires -Version 5.1
$ErrorActionPreference = "Continue"
$Host.UI.RawUI.WindowTitle = "Neon Installer (Pendrive)"
$installStart = Get-Date

$PENDRIVE   = Split-Path -Parent $PSScriptRoot
$DESTINO    = Join-Path $env:USERPROFILE "Neon"
$FFMPEG_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$LOG_FILE   = Join-Path $env:USERPROFILE "Desktop\neon_install_log.txt"
$NODE_VER   = "22.14.0"
$NODE_ZIP   = Join-Path $PENDRIVE "runtimes\node\node-v$NODE_VER-win-x64.zip"
$NEON_SRC   = Join-Path $PENDRIVE "neon"

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

function Test-Internet {
  try { Invoke-WebRequest -Uri "https://github.com" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop; return $true }
  catch { return $false }
}

Add-Content -Path $LOG_FILE -Value "=== Neon Installer Pendrive $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
logMSG "+------------------------------------------+" -color "Cyan"
logMSG "|     NEON INSTALLER v4.0 (PENDRIVE)        |" -color "Cyan"
logMSG "|     Otimizado - copia local + portatil    |" -color "Cyan"
logMSG "+------------------------------------------+" -color "Cyan"
logMSG ""

logMSG "Pendrive detectado em: $PENDRIVE"
logMSG ""

$online = Test-Internet
if ($online) { logMSG "  [OK] Internet disponivel" -color "Green" }
else { logMSG "  [!] Sem internet - modo offline parcial" -color "Yellow" }

# -- 1. Verificar arquivos --
step -num 1 -total 8 -msg "Verificando arquivos"
$required = @(
  @((Join-Path $NEON_SRC "index.js"), "Projeto Neon"),
  @((Join-Path $NEON_SRC "src"), "Pasta src"),
  @((Join-Path $NEON_SRC "package.json"), "package.json"),
  @($NODE_ZIP, "Node.js zip")
)
$ok = $true
foreach ($r in $required) {
  if (Test-Path $r[0]) { logMSG "  [OK] $($r[1])" -color "Green" }
  else { logMSG "  [FALTA] $($r[1]) em $($r[0])" -color "Red"; $ok = $false }
}
if (-not $ok) { logMSG "  Arquivos faltando! Verifique o pendrive." -color "Red"; pause; exit 1 }

# -- 2. Node.js portatil --
step -num 2 -total 8 -msg "Node.js portatil"
New-Item -ItemType Directory -Path "$DESTINO\node" -Force | Out-Null
$nodeCmd = "$DESTINO\node\node.exe"
if (-not (Test-Path $nodeCmd)) {
  logMSG "  Extraindo Node.js $NODE_VER do pendrive..." -color "Gray"
  try {
    Expand-Archive -Path $NODE_ZIP -DestinationPath "$DESTINO\node_tmp" -Force
    Move-Item -Path "$DESTINO\node_tmp\node-v$NODE_VER-win-x64\*" -Destination "$DESTINO\node" -Force
    Remove-Item "$DESTINO\node_tmp" -Recurse -Force -ErrorAction SilentlyContinue
    $env:PATH = "$DESTINO\node;$env:PATH"
    $v = & $nodeCmd --version
    logMSG "  [OK] Node.js $v extraido do pendrive" -color "Green"
  } catch { logMSG "  [FALHA] Extrair Node: $_" -color "Red"; pause; exit 1 }
} else {
  $env:PATH = "$DESTINO\node;$env:PATH"
  $v = & $nodeCmd --version
  logMSG "  [OK] Node.js $v ja instalado" -color "Green"
}

# -- 3. FFmpeg --
step -num 3 -total 8 -msg "FFmpeg"
if (-not (Test-Path "C:\ffmpeg\ffmpeg.exe")) {
  if ($online) {
    logMSG "  Baixando FFmpeg..." -color "Gray"
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
          $env:PATH = "$env:PATH;C:\ffmpeg"
        }
        logMSG "  [OK] FFmpeg em C:\ffmpeg" -color "Green"
      }
      Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    } catch { logMSG "  [!] Falha FFmpeg: $_" -color "Yellow" }
  } else { logMSG "  [!] Sem internet - FFmpeg nao instalado" -color "Yellow" }
} else { logMSG "  [OK] FFmpeg ja instalado" -color "Green" }

# -- 4. Copiar Neon do pendrive --
step -num 4 -total 8 -msg "Copiando Neon do pendrive"
if (Test-Path $DESTINO) {
  logMSG "  Destino ja existe. Mesclando arquivos..." -color "Gray"
  Copy-Item -Path "$NEON_SRC\*" -Destination $DESTINO -Recurse -Force -ErrorAction SilentlyContinue
  logMSG "  [OK] Arquivos mesclados" -color "Green"
} else {
  try {
    Copy-Item -Path $NEON_SRC -Destination $DESTINO -Recurse -Force
    logMSG "  [OK] Neon copiado do pendrive" -color "Green"
  } catch { logMSG "  [FALHA] Copiar Neon: $_" -color "Red"; pause; exit 1 }
}

# -- 5. npm install --
step -num 5 -total 8 -msg "Instalando dependencias"
Push-Location $DESTINO
try {
  if ($online) {
    $npmJob = Start-Job -ScriptBlock { param($d) Push-Location $d; try { npm install --production 2>&1 } catch { $_ } ; Pop-Location } -ArgumentList $DESTINO
    $npmJob | Wait-Job -Timeout 300 | Out-Null
    if ($npmJob.State -eq "Completed") { $result = Receive-Job $npmJob; logMSG "  [OK] npm install" -color "Green" }
    else { Stop-Job $npmJob; logMSG "  [!] npm install timeout (>5min)" -color "Yellow" }
    Remove-Job $npmJob -Force -ErrorAction SilentlyContinue
  } else {
    logMSG "  [!] Sem internet - dependencias NPM nao instaladas" -color "Yellow"
    logMSG "  Execute 'npm install' manualmente depois" -color "Gray"
  }
} catch { logMSG "  [!] npm falhou: $_" -color "Yellow" }

try {
  $oc = Get-Command "opencode" -ErrorAction SilentlyContinue
  if (-not $oc) {
    $ocPath = Join-Path $DESTINO "node_modules\.bin\opencode.cmd"
    if (-not (Test-Path $ocPath)) {
      if ($online) {
        logMSG "  Instalando opencode global..." -color "Gray"
        $ocJob = Start-Job -ScriptBlock { npm install -g opencode-ai 2>&1 }
        $ocJob | Wait-Job -Timeout 120 | Out-Null
        if ($ocJob.State -eq "Completed") { Receive-Job $ocJob | Out-Null; logMSG "  [OK] Opencode instalado" -color "Green" }
        else { Stop-Job $ocJob; logMSG "  [!] opencode timeout" -color "Yellow" }
        Remove-Job $ocJob -Force -ErrorAction SilentlyContinue
      } else { logMSG "  [!] Sem internet - Opencode nao instalado" -color "Yellow" }
    } else { logMSG "  [OK] Opencode local" -color "Green" }
  } else { logMSG "  [OK] Opencode ja instalado" -color "Green" }
} catch { logMSG "  [!] Opencode: $_" -color "Yellow" }
Pop-Location

# -- 6. .env --
step -num 6 -total 8 -msg "Arquivo .env"
$envFile = Join-Path $DESTINO ".env"
$encFile = Join-Path $PSScriptRoot "neon_env.enc"
$cripitarJs = Join-Path $DESTINO "scripts\cripitar.js"
if ((Test-Path $encFile) -and -not (Test-Path $envFile)) {
  logMSG "  Arquivo criptografado detectado!" -color "Yellow"
  do {
    $sec = Read-Host "  Digite a senha do .env" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    $pass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    if ($pass) {
      $result = & $nodeCmd $cripitarJs decripitar "$encFile" "$envFile" "$pass" 2>&1
      if ($LASTEXITCODE -eq 0 -and (Test-Path $envFile)) {
        logMSG "  [OK] .env decriptado" -color "Green"; break
      }
    }
    logMSG "  [!] Senha incorreta! Tente novamente." -color "Red"
  } while ($true)
} elseif (-not (Test-Path $envFile)) {
  @"
DISCORD_TOKEN=seu_token_aqui
GEMINI_API_KEY=sua_chave_aqui
TELEGRAM_TOKEN=seu_token_aqui
"@ | Set-Content -Path $envFile -Encoding UTF8
  logMSG "  [OK] .env criado (configure os tokens)" -color "Green"
} else { logMSG "  [OK] .env ja existe" -color "Green" }

# -- 7. Atalhos --
step -num 7 -total 8 -msg "Criando atalhos"
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
set PATH=%~dp0git\cmd;%~dp0node;%PATH%
:MENU
cls
echo ========================================
echo         NEON - Assistente Pessoal
echo ========================================
echo.
if not exist ".env" (
    echo [AVISO] .env nao encontrado
    pause
)
echo [INICIANDO NEON...]
echo.
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
$lnk2 = $shell.CreateShortcut((Join-Path $desktop "Neon - Dashboard.lnk"))
$lnk2.TargetPath = "http://localhost:3000"
$lnk2.Description = "Neon Dashboard"
$lnk2.Save()
logMSG "  [OK] Atalhos criados" -color "Green"

# -- 8. Final --
step -num 8 -total 8 -msg "Finalizando"
Write-Progress -Activity "Instalando Neon" -Completed
$elapsed = [math]::Round(((Get-Date) - $installStart).TotalSeconds)
logMSG ""
logMSG "+------------------------------------------+" -color "Cyan"
logMSG "|       INSTALACAO CONCLUIDA!              |" -color "Cyan"
logMSG "|   Tempo total: ${elapsed}s               |" -color "Cyan"
logMSG "|   Modo: Pendrive v4.0 (local + portatil) |" -color "Cyan"
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
