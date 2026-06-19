#Requires -Version 5.1
<#
.SYNOPSIS
    Instalador da Neon — prepara o PC para rodar a Neon.
    Baixa Node.js, clona o repositório, instala dependências e cria atalho.

    Esse script NÃO configura credenciais de push. Só permite git pull.
#>

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Neon Installer"

Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         NEON INSTALLER v1.0          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$REPO_URL    = "https://github.com/NeonInDev/Neon"
$DESTINO     = Join-Path $env:USERPROFILE "Neon"
$NODE_VERSION = "22.14.0"

# ─── 1. Verifica Node.js ───
Write-Host "[1/5] Verificando Node.js..." -ForegroundColor Yellow
$nodePath = (Get-Command "node" -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
    Write-Host "  Node.js não encontrado. Baixando versão portátil..." -ForegroundColor Gray
    $nodeUrl = "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-win-x64.zip"
    $zipPath = Join-Path $env:TEMP "node.zip"
    try {
        Invoke-WebRequest -Uri $nodeUrl -OutFile $zipPath -UseBasicParsing
        $destNode = Join-Path $DESTINO "node"
        Expand-Archive -Path $zipPath -DestinationPath $destNode -Force
        $nodeExe = Join-Path $destNode "node-v$NODE_VERSION-win-x64\node.exe"
        $env:PATH = "$(Split-Path $nodeExe);$env:PATH"
        Write-Host "  ✓ Node.js $NODE_VERSION extraído em: $destNode" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Falha ao baixar Node.js: $_" -ForegroundColor Red
        Write-Host "  Tente winget: winget install OpenJS.NodeJS" -ForegroundColor Yellow
    }
} else {
    $nodeVer = & node --version
    Write-Host "  ✓ Node.js $nodeVer encontrado em: $nodePath" -ForegroundColor Green
}

# ─── 2. Clona/Puxa repositório ───
Write-Host "[2/5] Clonando Neon..." -ForegroundColor Yellow
if (Test-Path (Join-Path $DESTINO "index.js")) {
    Write-Host "  Repositório já existe. Atualizando..." -ForegroundColor Gray
    Push-Location $DESTINO
    try {
        & git pull --ff-only 2>&1 | Out-Null
        Write-Host "  ✓ Projeto atualizado" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠ git pull falhou, repositório pode ter modificações locais" -ForegroundColor Yellow
    }
    Pop-Location
} else {
    try {
        & git clone $REPO_URL $DESTINO 2>&1
        Write-Host "  ✓ Repositório clonado" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Falha ao clonar: $_" -ForegroundColor Red
        Write-Host "  Certifique-se de ter o Git instalado: winget install Git.Git" -ForegroundColor Yellow
        exit 1
    }
}

# ─── 3. Bloqueia push ───
Write-Host "[3/5] Bloqueando git push..." -ForegroundColor Yellow
Push-Location $DESTINO
try {
    & git remote set-url --push origin http://nopush.invalid 2>&1 | Out-Null
    Write-Host "  ✓ Push desabilitado (git push será rejeitado)" -ForegroundColor Green
} catch {
    Write-Host "  ⚠ Não foi possível bloquear push: $_" -ForegroundColor Yellow
}
Pop-Location

# ─── 4. Instala dependências ───
Write-Host "[4/5] Instalando dependências (npm install)..." -ForegroundColor Yellow
Push-Location $DESTINO
try {
    & npm install --production 2>&1
    Write-Host "  ✓ Dependências instaladas" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Falha no npm install: $_" -ForegroundColor Red
}
Pop-Location

# ─── 5. Cria atalhos ───
Write-Host "[5/5] Criando atalhos..." -ForegroundColor Yellow
$WScriptShell = New-Object -ComObject WScript.Shell

$iniciarBat = Join-Path $DESTINO "iniciar_neon.bat"
if (-not (Test-Path $iniciarBat)) {
    @"
@echo off
cd /d "%~dp0"
echo.
echo [INICIANDO NEON...]
echo.
node index.js
pause
"@ | Set-Content -Path $iniciarBat -Encoding ASCII
}

$desktop = [Environment]::GetFolderPath("Desktop")
$atalho = $WScriptShell.CreateShortcut((Join-Path $desktop "Neon.lnk"))
$atalho.TargetPath = "cmd.exe"
$atalho.Arguments = "/c `"$iniciarBat`""
$atalho.WorkingDirectory = $DESTINO
$atalho.WindowStyle = 1  # Normal
$atalho.Description = "Iniciar Neon"
$atalho.Save()

# Atalho pra instalar como admin
$instalarLink = $WScriptShell.CreateShortcut((Join-Path $desktop "Neon - Instalar dependencias.lnk"))
$instalarLink.TargetPath = "powershell.exe"
$instalarLink.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
$instalarLink.WorkingDirectory = $DESTINO
$instalarLink.WindowStyle = 1
$instalarLink.Description = "Reinstalar/atualizar dependencias da Neon"
$instalarLink.Save()

Write-Host "  ✓ Atalhos criados na Área de Trabalho" -ForegroundColor Green

# ─── Final ───
Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       INSTALAÇÃO CONCLUÍDA!          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para iniciar a Neon:" -ForegroundColor White
Write-Host "  1. Abra o atalho [Neon] na área de trabalho" -ForegroundColor White
Write-Host "  2. Ou execute: node index.js na pasta $DESTINO" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANTE:" -ForegroundColor Yellow
Write-Host "  • Crie um arquivo .env dentro da pasta Neon com suas chaves" -ForegroundColor Yellow
Write-Host "  • git push está DESABILITADO — só é possível puxar atualizações" -ForegroundColor Yellow
Write-Host "  • Para atualizar: git pull na pasta Neon (ou rode este script de novo)" -ForegroundColor Yellow
Write-Host ""

pause
