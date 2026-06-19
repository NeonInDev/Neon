#Requires -Version 5.1
<#
.SYNOPSIS
    Instalador completo da Neon — prepara o PC para rodar a assistente.
    Instala Node.js, VS Code, Blender, clona o repositório e configura tudo.

    Esse script NÃO configura credenciais de push. Só permite git pull.
#>

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Neon Installer"

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         NEON INSTALLER v1.0              ║" -ForegroundColor Cyan
Write-Host "║     Instala Node, VS Code, Blender       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$REPO_URL    = "https://github.com/NeonInDev/Neon"
$DESTINO     = Join-Path $env:USERPROFILE "Neon"
$NODE_VER    = "22.14.0"
$VSCODE_VER  = "latest"
$FFMPEG_URL  = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

# ─── 1. Verifica Winget ───
Write-Host "[1/8] Verificando winget..." -ForegroundColor Yellow
$winget = Get-Command "winget" -ErrorAction SilentlyContinue
if (-not $winget) {
    Write-Host "  ⚠ winget não encontrado. Instale os App Installer da Microsoft Store." -ForegroundColor Yellow
} else {
    Write-Host "  ✓ winget disponível" -ForegroundColor Green
}

# ─── 2. Node.js ───
Write-Host "[2/8] Verificando Node.js..." -ForegroundColor Yellow
$nodePath = (Get-Command "node" -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
    Write-Host "  Node.js não encontrado. Instalando via winget..." -ForegroundColor Gray
    if ($winget) {
        try { & winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements 2>&1 | Out-Null; Write-Host "  ✓ Node.js instalado via winget" -ForegroundColor Green } catch { Write-Host "  ⚠ winget falhou, baixando portátil..." -ForegroundColor Yellow }
    }
    $nodePath = (Get-Command "node" -ErrorAction SilentlyContinue).Source
    if (-not $nodePath) {
        try {
            $nodeUrl = "https://nodejs.org/dist/v$NODE_VER/node-v$NODE_VER-win-x64.zip"
            $zipPath = Join-Path $env:TEMP "node.zip"
            Invoke-WebRequest -Uri $nodeUrl -OutFile $zipPath -UseBasicParsing
            $destNode = Join-Path $DESTINO "node"
            Expand-Archive -Path $zipPath -DestinationPath $destNode -Force
            $env:PATH = "$(Join-Path $destNode "node-v$NODE_VER-win-x64");$env:PATH"
            Write-Host "  ✓ Node.js $NODE_VER extraído em: $destNode" -ForegroundColor Green
        } catch { Write-Host "  ✗ Falha ao baixar Node.js: $_" -ForegroundColor Red; exit 1 }
    }
} else {
    $nodeVer = & node --version
    Write-Host "  ✓ Node.js $nodeVer encontrado" -ForegroundColor Green
}

# ─── 3. VS Code ───
Write-Host "[3/8] Verificando VS Code..." -ForegroundColor Yellow
$codePath = (Get-Command "code" -ErrorAction SilentlyContinue).Source
if (-not $codePath) {
    Write-Host "  VS Code não encontrado. Instalando via winget..." -ForegroundColor Gray
    if ($winget) {
        try {
            & winget install Microsoft.VisualStudioCode --silent --accept-package-agreements 2>&1 | Out-Null
            $env:PATH += ";$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin"
            Write-Host "  ✓ VS Code instalado" -ForegroundColor Green
        } catch { Write-Host "  ✗ Falha ao instalar VS Code: $_" -ForegroundColor Red }
    }
} else {
    Write-Host "  ✓ VS Code encontrado" -ForegroundColor Green
}

# ─── 4. Blender ───
Write-Host "[4/8] Blender..." -ForegroundColor Yellow
$blenderPath = (Get-Command "blender" -ErrorAction SilentlyContinue).Source
$blenderFound = $blenderPath -or (Get-ChildItem "$env:ProgramFiles\Blender Foundation\*\blender.exe" -ErrorAction SilentlyContinue)
$blenderLocal = Get-ChildItem "$env:LOCALAPPDATA\Blender Foundation\*\blender.exe" -ErrorAction SilentlyContinue
if ($blenderFound -or $blenderLocal) {
    Write-Host "  ✓ Blender encontrado" -ForegroundColor Green
} else {
    Write-Host "  Blender não encontrado." -ForegroundColor Yellow
    Write-Host "  Deseja instalar o Blender 5.1? (~350MB)" -ForegroundColor White
    Write-Host "  [S] Sim (recomendado)  |  [N] Pular" -ForegroundColor Gray
    $key = $Host.UI.RawUI.ReadKey("IncludeKeyDown").Character
    if ($key -eq 's' -or $key -eq 'S') {
        try {
            if ($winget) {
                Write-Host "  Instalando via winget..." -ForegroundColor Gray
                & winget install BlenderFoundation.Blender --silent --accept-package-agreements 2>&1 | Out-Null
            } else {
                Write-Host "  Baixando Blender portátil..." -ForegroundColor Gray
                $blenderUrl = "https://download.blender.org/release/Blender5.1/blender-5.1.2-windows-x64.zip"
                $zipPath = Join-Path $env:TEMP "blender.zip"
                Invoke-WebRequest -Uri $blenderUrl -OutFile $zipPath -UseBasicParsing
                Expand-Archive -Path $zipPath -DestinationPath $DESTINO -Force
                $env:PATH += ";$(Join-Path $DESTINO "blender-5.1.2-windows-x64")"
                Write-Host "  ✓ Blender baixado" -ForegroundColor Green
            }
        } catch { Write-Host "  ⚠ Falha ao instalar Blender: $_" -ForegroundColor Yellow }
    } else {
        Write-Host "  Pulando Blender" -ForegroundColor Gray
    }
}

# ─── 5. FFmpeg ───
Write-Host "[5/8] FFmpeg..." -ForegroundColor Yellow
$ffmpegPath = "C:\ffmpeg\ffmpeg.exe"
if (-not (Test-Path $ffmpegPath)) {
    Write-Host "  Baixando FFmpeg..." -ForegroundColor Gray
    try {
        $zipPath = Join-Path $env:TEMP "ffmpeg.zip"
        Invoke-WebRequest -Uri $FFMPEG_URL -OutFile $zipPath -UseBasicParsing
        $tempExtract = Join-Path $env:TEMP "ffmpeg_extract"
        Expand-Archive -Path $zipPath -DestinationPath $tempExtract -Force
        $ffExe = Get-ChildItem -Path $tempExtract -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
        if ($ffExe) {
            New-Item -ItemType Directory -Path "C:\ffmpeg" -Force | Out-Null
            Copy-Item -Path "$($ffExe.Directory.FullName)\*" -Destination "C:\ffmpeg" -Recurse -Force
            Write-Host "  ✓ FFmpeg instalado em C:\ffmpeg" -ForegroundColor Green
            $oldPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
            if ($oldPath -notlike "*C:\ffmpeg*") {
                [Environment]::SetEnvironmentVariable("Path", "$oldPath;C:\ffmpeg", "Machine")
                Write-Host "  ✓ FFmpeg adicionado ao PATH do sistema" -ForegroundColor Green
            }
        }
        Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
    } catch { Write-Host "  ⚠ Falha ao baixar FFmpeg: $_" -ForegroundColor Yellow }
} else {
    Write-Host "  ✓ FFmpeg já instalado" -ForegroundColor Green
}

# ─── 6. Clona/Puxa repositório ───
Write-Host "[6/8] Clonando Neon..." -ForegroundColor Yellow
if (Test-Path (Join-Path $DESTINO "index.js")) {
    Write-Host "  Repositório já existe. Atualizando..." -ForegroundColor Gray
    Push-Location $DESTINO
    try { & git pull --ff-only 2>&1 | Out-Null; Write-Host "  ✓ Projeto atualizado" -ForegroundColor Green } catch { Write-Host "  ⚠ git pull falhou" -ForegroundColor Yellow }
    Pop-Location
} else {
    try { & git clone $REPO_URL $DESTINO 2>&1; Write-Host "  ✓ Repositório clonado" -ForegroundColor Green }
    catch { Write-Host "  ✗ Falha ao clonar. Instale git: winget install Git.Git" -ForegroundColor Red; exit 1 }
}

# ─── 7. Bloqueia push ───
Write-Host "[7/8] Bloqueando git push..." -ForegroundColor Yellow
Push-Location $DESTINO
try { & git remote set-url --push origin http://nopush.invalid 2>&1 | Out-Null; Write-Host "  ✓ Push desabilitado" -ForegroundColor Green } catch { Write-Host "  ⚠ Não foi possível bloquear push" -ForegroundColor Yellow }
Pop-Location

# ─── 8. Dependências ───
Write-Host "[8/9] Instalando dependências..." -ForegroundColor Yellow
Push-Location $DESTINO
try { & npm install --production 2>&1 | Out-Null; Write-Host "  ✓ Dependências instaladas" -ForegroundColor Green } catch { Write-Host "  ✗ npm install falhou: $_" -ForegroundColor Red }
Pop-Location

# ─── 9. Opencode ───
Write-Host "[9/9] Instalando Opencode..." -ForegroundColor Yellow
try {
    $oc = Get-Command "opencode" -ErrorAction SilentlyContinue
    if (-not $oc) {
        & npm install -g opencode-ai 2>&1 | Out-Null
        Write-Host "  ✓ Opencode instalado globalmente" -ForegroundColor Green
    } else {
        $ocVer = & opencode --version 2>&1
        Write-Host "  ✓ Opencode já instalado ($ocVer)" -ForegroundColor Green
    }
} catch { Write-Host "  ⚠ Falha ao instalar Opencode: $_" -ForegroundColor Yellow }

# ─── Atalhos ───
$WScriptShell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")

$iniciarBat = Join-Path $DESTINO "iniciar_neon.bat"
@"@echo off
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

$atalho = $WScriptShell.CreateShortcut((Join-Path $desktop "Neon.lnk"))
$atalho.TargetPath = "cmd.exe"
$atalho.Arguments = "/c `"$iniciarBat`""
$atalho.WorkingDirectory = $DESTINO
$atalho.WindowStyle = 1
$atalho.Description = "Iniciar Neon"
$atalho.Save()

$atalho2 = $WScriptShell.CreateShortcut((Join-Path $desktop "Neon - Web UI.lnk"))
$atalho2.TargetPath = "http://localhost:3000"
$atalho2.Description = "Neon Web Interface"
$atalho2.Save()

Write-Host "  ✓ Atalhos criados" -ForegroundColor Green

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       INSTALAÇÃO CONCLUÍDA!              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Para iniciar:  [Neon] na área de trabalho" -ForegroundColor White
Write-Host "  Web UI:        http://localhost:3000" -ForegroundColor White
Write-Host "  Git push:      DESABILITADO (só git pull)" -ForegroundColor Yellow
Write-Host "  Para atualizar: git pull na pasta Neon" -ForegroundColor Yellow
Write-Host ""

# Notificação de conclusão
try {
  $popup = New-Object -ComObject wscript.shell
  $popup.Popup("Neon instalada com sucesso!`n`nAtalho na Area de Trabalho.`nWeb UI: http://localhost:3000", 10, "Neon Installer", 64)
} catch {}

pause
