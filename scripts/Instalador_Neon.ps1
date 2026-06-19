#Requires -Version 5.1
$ErrorActionPreference = "Continue"
$Host.UI.RawUI.WindowTitle = "Neon Installer"
$installStart = Get-Date

$REPO_URL   = "https://github.com/NeonInDev/Neon"
$DESTINO    = Join-Path $env:USERPROFILE "Neon"
$FFMPEG_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$GIT_URL    = "https://github.com/git-for-windows/git/releases/download/v2.48.1.windows.1/Git-2.48.1-64-bit.exe"
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
  param($name, $wingetId, $timeoutSec = 120)
  logMSG "  Instalando $name via winget..." -color "Gray"
  $proc = Start-Process -FilePath "winget" -ArgumentList "install $wingetId --silent --accept-package-agreements" -NoNewWindow -PassThru -Wait -WindowStyle Hidden
  $exitCode = $proc.ExitCode
  if ($exitCode -eq 0) { logMSG "  [OK] $name instalado" -color "Green"; return $true }
  logMSG "  [!] winget $name falhou (codigo $exitCode)" -color "Yellow"
  return $false
}

Add-Content -Path $LOG_FILE -Value "=== Neon Installer $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
logMSG "+------------------------------------------+" -color "Cyan"
logMSG "|         NEON INSTALLER v3.1              |" -color "Cyan"
logMSG "|     Instala tudo pra rodar a Neon        |" -color "Cyan"
logMSG "+------------------------------------------+" -color "Cyan"
logMSG ""

# -- Verificacao de arquivos --
logMSG "Verificando arquivos do instalador..."
$reqFiles = @("neon_env.enc", "cripitar.js")
foreach ($f in $reqFiles) {
  $fPath = Join-Path $PSScriptRoot $f
  if (Test-Path $fPath) { logMSG "  [OK] $f encontrado" -color "Green" }
  else { logMSG "  [!] $f nao encontrado em $PSScriptRoot" -color "Yellow" }
}
logMSG "  Pasta do instalador: $PSScriptRoot"
logMSG "  Destino: $DESTINO"
logMSG "  Log: $LOG_FILE"

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
else { logMSG "  [!] winget nao encontrado" -color "Yellow" }

# -- 2. Git (portatil, sem winget) --
step -num 2 -total 9 -msg "Git"
New-Item -ItemType Directory -Path "$env:USERPROFILE\Neon\git" -Force | Out-Null
$gitPortable = "$env:USERPROFILE\Neon\git\cmd\git.exe"
if (-not (Test-Path $gitPortable)) {
  logMSG "  Baixando Git portatil..." -color "Gray"
  try {
    $zipUrl = "https://github.com/git-for-windows/git/releases/download/v2.48.1.windows.1/PortableGit-2.48.1-64-bit.7z.exe"
    $exePath = Join-Path $env:TEMP "git-portable.exe"
    logMSG "  Download de $zipUrl ..." -color "Gray"
    Invoke-WebRequest -Uri $zipUrl -OutFile $exePath -UseBasicParsing -TimeoutSec 120
    $destGit = "$env:USERPROFILE\Neon\git"
    logMSG "  Extraindo..." -color "Gray"
    Start-Process -FilePath $exePath -ArgumentList "-o$destGit -y" -NoNewWindow -Wait
    if (Test-Path $gitPortable) {
      $env:PATH = "$env:USERPROFILE\Neon\git\cmd;$env:PATH"
      logMSG "  [OK] Git portatil instalado" -color "Green"
    } else {
      logMSG "  [FALHA] Git portatil nao extraiu corretamente" -color "Red"
      pause; exit 1
    }
  } catch {
    logMSG "  [FALHA] Git portatil: $_" -color "Red"
    pause; exit 1
  }
} else {
  logMSG "  [OK] Git ja instalado" -color "Green"
  $env:PATH = "$env:USERPROFILE\Neon\git\cmd;$env:PATH"
}

# -- 3. Node.js (portatil, sem winget) --
step -num 3 -total 9 -msg "Node.js"
New-Item -ItemType Directory -Path "$env:USERPROFILE\Neon\node" -Force | Out-Null
$nodeCmd = "$env:USERPROFILE\Neon\node\node.exe"
if (-not (Test-Path $nodeCmd)) {
  logMSG "  Baixando Node.js portatil..." -color "Gray"
  try {
    $nodeVer = "22.14.0"
    $nodeUrl = "https://nodejs.org/dist/v$nodeVer/node-v$nodeVer-win-x64.zip"
    $zipPath = Join-Path $env:TEMP "node.zip"
    logMSG "  Download de $nodeUrl ..." -color "Gray"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 120
    Expand-Archive -Path $zipPath -DestinationPath "$env:USERPROFILE\Neon\node_tmp" -Force
    Move-Item -Path "$env:USERPROFILE\Neon\node_tmp\node-v$nodeVer-win-x64\*" -Destination "$env:USERPROFILE\Neon\node" -Force
    Remove-Item -Path "$env:USERPROFILE\Neon\node_tmp" -Recurse -Force -ErrorAction SilentlyContinue
    $env:PATH = "$env:USERPROFILE\Neon\node;$env:PATH"
    $v = & $nodeCmd --version
    logMSG "  [OK] Node.js $v" -color "Green"
  } catch { logMSG "  [FALHA] Node.js: $_" -color "Red"; pause; exit 1 }
} else {
  $env:PATH = "$env:USERPROFILE\Neon\node;$env:PATH"
  $v = & $nodeCmd --version
  logMSG "  [OK] Node.js $v" -color "Green"
}

# -- 4. FFmpeg --
step -num 4 -total 9 -msg "FFmpeg"
if (-not (Test-Path "C:\ffmpeg\ffmpeg.exe")) {
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
} else { logMSG "  [OK] FFmpeg ja instalado" -color "Green" }

# -- 5. Clonar --
step -num 5 -total 9 -msg "Clonando repositorio"
if (Test-Path (Join-Path $DESTINO "index.js")) {
  logMSG "  Repositorio ja existe. Atualizando..." -color "Gray"
  Push-Location $DESTINO
  try { & $gitPortable pull --ff-only 2>&1 | Out-Null; logMSG "  [OK] Atualizado" -color "Green" } catch { logMSG "  [!] git pull falhou: $_" -color "Yellow" }
  Pop-Location
} else {
  try { & $gitPortable clone $REPO_URL $DESTINO 2>&1; logMSG "  [OK] Clonado" -color "Green" }
  catch { logMSG "  [FALHA] git clone: $_" -color "Red"; pause; exit 1 }
}

# -- 6. Dependencias --
step -num 6 -total 9 -msg "Instalando dependencias"
Push-Location $DESTINO
try {
  $npmJob = Start-Job -ScriptBlock { param($d) Push-Location $d; npm install --production 2>&1; Pop-Location } -ArgumentList $DESTINO
  $npmJob | Wait-Job -Timeout 180 | Out-Null
  if ($npmJob.State -eq "Completed") { Receive-Job $npmJob | Out-Null; logMSG "  [OK] npm install" -color "Green" }
  else { Stop-Job $npmJob; logMSG "  [!] npm install timeout (>3min)" -color "Yellow" }
  Remove-Job $npmJob -Force -ErrorAction SilentlyContinue
} catch { logMSG "  [!] npm falhou: $_" -color "Yellow" }
try {
  $oc = Get-Command "opencode" -ErrorAction SilentlyContinue -ErrorVariable ocErr
  if (-not $oc) {
    $oc2 = & $nodeCmd (Join-Path $DESTINO "node_modules\.bin\opencode.cmd") --version 2>&1 | Out-String
    if (-not ($oc2 -match '\d+\.\d+')) {
      logMSG "  Instalando opencode global..." -color "Gray"
      $ocJob = Start-Job -ScriptBlock { npm install -g opencode-ai 2>&1 }
      $ocJob | Wait-Job -Timeout 120 | Out-Null
      if ($ocJob.State -eq "Completed") { Receive-Job $ocJob | Out-Null; logMSG "  [OK] Opencode instalado" -color "Green" }
      else { Stop-Job $ocJob; logMSG "  [!] opencode timeout" -color "Yellow" }
      Remove-Job $ocJob -Force -ErrorAction SilentlyContinue
    } else { logMSG "  [OK] Opencode local" -color "Green" }
  } else { logMSG "  [OK] Opencode ja instalado" -color "Green" }
} catch { logMSG "  [!] Opencode: $_" -color "Yellow" }
Pop-Location

# -- 7. .env (decripitar se existir neon_env.enc) --
step -num 7 -total 9 -msg "Arquivo .env"
$envFile = Join-Path $DESTINO ".env"
$encFile = Join-Path $PSScriptRoot "neon_env.enc"
$cripitarJs = Join-Path $DESTINO "scripts\cripitar.js"
if (Test-Path $encFile -and -not (Test-Path $envFile)) {
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

# -- 8. Atalhos --
step -num 8 -total 9 -msg "Criando atalhos"
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
echo.
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

# -- 9. Limpeza --
step -num 9 -total 9 -msg "Finalizando"
try { & $gitPortable -C $DESTINO remote set-url --push origin http://nopush.invalid 2>&1 | Out-Null } catch {}
logMSG "  Push remoto desabilitado (seguranca)" -color "Gray"

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
