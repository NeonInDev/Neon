#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Neon Installer"

$REPO_URL   = "https://github.com/NeonInDev/Neon"
$DESTINO    = Join-Path $env:USERPROFILE "Neon"
$FFMPEG_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host "|         NEON INSTALLER v2.0              |" -ForegroundColor Cyan
Write-Host "|     Instala tudo pra rodar a Neon        |" -ForegroundColor Cyan
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host ""

# -- 1. Winget --
Write-Host "[1/9] Winget..." -ForegroundColor Yellow
$winget = Get-Command "winget" -ErrorAction SilentlyContinue
if ($winget) { Write-Host "  [OK] winget disponivel" -ForegroundColor Green }
else { Write-Host "  [!] winget nao encontrado" -ForegroundColor Yellow }

# -- 2. Git --
Write-Host "[2/9] Git..." -ForegroundColor Yellow
$gitPath = (Get-Command "git" -ErrorAction SilentlyContinue).Source
if (-not $gitPath -and $winget) {
    Write-Host "  Instalando Git (pode levar alguns minutos)..." -ForegroundColor Yellow
    Write-Host "  Aguarde... mostrando saida do winget:" -ForegroundColor Gray
    try { & winget install Git.Git --silent --accept-package-agreements 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }; if ($LASTEXITCODE -eq 0) { Write-Host "  [OK] Git instalado" -ForegroundColor Green } else { Write-Host "  [FALHA] Git: codigo $LASTEXITCODE" -ForegroundColor Red } } catch { Write-Host "  [FALHA] Git: $_" -ForegroundColor Red }
} elseif ($gitPath) { Write-Host "  [OK] Git encontrado" -ForegroundColor Green }
else { Write-Host "  [FALHA] Instale Git manualmente: winget install Git.Git" -ForegroundColor Red }

# -- 3. Node.js --
Write-Host "[3/9] Node.js..." -ForegroundColor Yellow
$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    if ($winget) {
        Write-Host "  Instalando Node.js via winget..." -ForegroundColor Yellow
        Write-Host "  (pode levar alguns minutos)" -ForegroundColor Gray
        try { & winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }; if ($LASTEXITCODE -eq 0) { Write-Host "  [OK] Node.js instalado" -ForegroundColor Green } else { Write-Host "  [!] winget falhou (codigo $LASTEXITCODE)" -ForegroundColor Yellow } } catch { Write-Host "  [!] winget falhou: $_" -ForegroundColor Yellow }
    }
    $nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Write-Host "  Baixando Node.js portatil..." -ForegroundColor Gray
        try {
            $nodeVer = "22.14.0"
            $nodeUrl = "https://nodejs.org/dist/v$nodeVer/node-v$nodeVer-win-x64.zip"
            $zipPath = Join-Path $env:TEMP "node.zip"
            Invoke-WebRequest -Uri $nodeUrl -OutFile $zipPath -UseBasicParsing
            $destNode = Join-Path $DESTINO "node"
            Expand-Archive -Path $zipPath -DestinationPath $destNode -Force
            $env:PATH = "$(Join-Path $destNode "node-v$nodeVer-win-x64");$env:PATH"
            Write-Host "  [OK] Node.js $nodeVer em $destNode" -ForegroundColor Green
        } catch { Write-Host "  [FALHA] Node.js: $_" -ForegroundColor Red; exit 1 }
    }
} else {
    $v = & node --version
    Write-Host "  [OK] Node.js $v" -ForegroundColor Green
}

# -- 4. VS Code --
Write-Host "[4/9] VS Code..." -ForegroundColor Yellow
$codeCmd = Get-Command "code" -ErrorAction SilentlyContinue
if (-not $codeCmd) {
    if ($winget) {
        Write-Host "  Instalando VS Code (pode levar alguns minutos)..." -ForegroundColor Yellow
        try { & winget install Microsoft.VisualStudioCode --silent --accept-package-agreements 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }; if ($LASTEXITCODE -eq 0) { Write-Host "  [OK] VS Code instalado" -ForegroundColor Green } else { Write-Host "  [!] Falha VS Code (codigo $LASTEXITCODE)" -ForegroundColor Yellow } } catch { Write-Host "  [!] Falha VS Code: $_" -ForegroundColor Yellow }
    }
}
if ($codeCmd) { Write-Host "  [OK] VS Code encontrado" -ForegroundColor Green }
else { Write-Host "  [-] VS Code nao instalado (opcional)" -ForegroundColor Gray }

# -- 5. Blender --
Write-Host "[5/9] Blender..." -ForegroundColor Yellow
$blenderFound = $false
$blenderPaths = @(
    "$env:ProgramFiles\Blender Foundation\*\blender.exe",
    "${env:ProgramFiles(x86)}\Blender Foundation\*\blender.exe",
    "$env:LOCALAPPDATA\Blender Foundation\*\blender.exe"
)
foreach ($p in $blenderPaths) {
    if (Get-ChildItem $p -ErrorAction SilentlyContinue) { $blenderFound = $true; break }
}
if (-not $blenderFound) { $blenderFound = (Get-Command "blender" -ErrorAction SilentlyContinue).Source }
if (-not $blenderFound) {
    Write-Host "  Deseja instalar Blender? [S/N]" -ForegroundColor White
    $key = [Console]::ReadKey($true).KeyChar
    if ($key -eq 's' -or $key -eq 'S') {
        try { & winget install BlenderFoundation.Blender --silent --accept-package-agreements 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }; if ($LASTEXITCODE -eq 0) { Write-Host "  [OK] Blender instalado" -ForegroundColor Green } else { Write-Host "  [!] Falha Blender (codigo $LASTEXITCODE)" -ForegroundColor Yellow } } catch { Write-Host "  [!] Falha Blender: $_" -ForegroundColor Yellow }
    } else { Write-Host "  [-] Pulando Blender" -ForegroundColor Gray }
} else { Write-Host "  [OK] Blender encontrado" -ForegroundColor Green }

# -- 6. FFmpeg --
Write-Host "[6/9] FFmpeg..." -ForegroundColor Yellow
if (-not (Test-Path "C:\ffmpeg\ffmpeg.exe")) {
    Write-Host "  Baixando FFmpeg..." -ForegroundColor Gray
    try {
        $zipPath = Join-Path $env:TEMP "ffmpeg.zip"
        Invoke-WebRequest -Uri $FFMPEG_URL -OutFile $zipPath -UseBasicParsing
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
            Write-Host "  [OK] FFmpeg em C:\ffmpeg" -ForegroundColor Green
        }
        Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    } catch { Write-Host "  [!] Falha FFmpeg: $_" -ForegroundColor Yellow }
} else { Write-Host "  [OK] FFmpeg ja instalado" -ForegroundColor Green }

# -- 7. Clonar repositorio --
Write-Host "[7/9] Clonando Neon..." -ForegroundColor Yellow
if (Test-Path (Join-Path $DESTINO "index.js")) {
    Write-Host "  Repositorio ja existe. Atualizando..." -ForegroundColor Gray
    Push-Location $DESTINO
    try { & git pull --ff-only 2>&1 | Out-Null; Write-Host "  [OK] Atualizado" -ForegroundColor Green } catch { Write-Host "  [!] git pull falhou" -ForegroundColor Yellow }
    Pop-Location
} else {
    try { & git clone $REPO_URL $DESTINO 2>&1; Write-Host "  [OK] Clonado" -ForegroundColor Green }
    catch { Write-Host "  [FALHA] git clone: $_" -ForegroundColor Red; exit 1 }
}

# -- 8. Dependencias + Opencode --
Write-Host "[8/9] Dependencias..." -ForegroundColor Yellow
Push-Location $DESTINO
try { & npm install --production 2>&1 | Out-Null; Write-Host "  [OK] npm install" -ForegroundColor Green } catch { Write-Host "  [!] npm falhou: $_" -ForegroundColor Yellow }
try {
    $oc = Get-Command "opencode" -ErrorAction SilentlyContinue
    if (-not $oc) { & npm install -g opencode-ai 2>&1 | Out-Null; Write-Host "  [OK] Opencode global" -ForegroundColor Green }
    else { Write-Host "  [OK] Opencode ja instalado" -ForegroundColor Green }
} catch { Write-Host "  [!] Opencode falhou: $_" -ForegroundColor Yellow }
Pop-Location

# -- 9. Atalhos --
Write-Host "[9/9] Criando atalhos..." -ForegroundColor Yellow
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

Write-Host "  [OK] Atalhos criados" -ForegroundColor Green
Write-Host ""
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host "|       INSTALACAO CONCLUIDA!              |" -ForegroundColor Cyan
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Neon: atalho na Area de Trabalho" -ForegroundColor White
Write-Host "  Docs: http://localhost:3000" -ForegroundColor White
Write-Host ""

try {
    $popup = New-Object -ComObject wscript.shell
    $popup.Popup("Neon instalada com sucesso!", 10, "Neon Installer", 64)
} catch {}

pause
