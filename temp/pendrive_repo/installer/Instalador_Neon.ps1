#Requires -Version 5.1
param([switch]$Silent)

$ErrorActionPreference = "Continue"
$Host.UI.RawUI.WindowTitle = "Instalar Neon v4.0"

function IsJobContext {
  if ($Silent) { return $true }
  $name = $Host.Name
  if ($name -ne "ConsoleHost" -and $name -ne "Windows PowerShell ISE Host") { return $true }
  return $false
}
function SafePause { if (-not (IsJobContext)) { Write-Host "`nPressione Enter para continuar..."; $null = Read-Host } }
function Write-Step { $msg = "[$(Get-Date -Format 'HH:mm:ss')] $args"; Write-Host $msg -ForegroundColor Cyan }
function Write-OK { Write-Host "  [OK] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "  [!] $args" -ForegroundColor Yellow }

trap {
  $err = $_.Exception.Message
  Write-Host "`n[ERRO FATAL] $err" -ForegroundColor Red
  Add-Content -Path "$env:USERPROFILE\Desktop\neon_error.txt" -Value "[$(Get-Date)] FATAL: $err"
  if (-not (IsJobContext)) {
    Write-Host "`nPressione Enter para fechar..."
    $null = Read-Host
  }
  exit 1
}

$PENDRIVE  = Split-Path -Parent $PSScriptRoot
$DESTINO   = Join-Path $env:USERPROFILE "Neon"
$LOG_FILE  = Join-Path $env:USERPROFILE "Desktop\neon_install_log.txt"

Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host "|      NEON - ASSISTENTE PESSOAL v4.0      |" -ForegroundColor Cyan
Write-Host "|      Instalacao otimizada (offline)       |" -ForegroundColor Cyan
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host ""

if (-not $Silent) {
  Write-Host "Isso vai instalar o Neon em: $DESTINO" -ForegroundColor Yellow
  Write-Host "  * Node.js portatil (zip incluso)"
  Write-Host "  * Projeto copiado do pendrive"
  Write-Host "  * Atalhos na area de trabalho"
  SafePause
}

# ── Step 1: Verificar pendrive ────────────────────────
Write-Step "Passo 1/8 - Verificando pendrive..."
$required = @(
    (Join-Path $PENDRIVE "installer\Instalador_Neon.ps1")
    (Join-Path $PENDRIVE "runtimes\node\node-v22.14.0-win-x64.zip")
    (Join-Path $PENDRIVE "neon")
    (Join-Path $PENDRIVE "installer\neon_env.enc")
    (Join-Path $PENDRIVE "assets\neon.ico")
)
$missing = $false
foreach ($r in $required) {
    if (-not (Test-Path $r)) { Write-Warn "Arquivo ausente: $r"; $missing = $true }
}
if ($missing) {
    Write-Host "[ERRO] Arquivos faltando no pendrive." -ForegroundColor Red
    SafePause; exit 1
}
Write-OK "Pendrive verificado"

# ── Step 2: Criar pasta destino ──────────────────────
Write-Step "Passo 2/8 - Criando pasta de destino..."
New-Item -ItemType Directory -Path $DESTINO -Force | Out-Null
Write-OK "Pasta criada: $DESTINO"

# ── Step 3: Copiar projeto ───────────────────────────
Write-Step "Passo 3/8 - Copiando projeto..."
$src = Join-Path $PENDRIVE "neon"
$dst = Join-Path $DESTINO "neon"
if (Test-Path $dst) { Remove-Item -Path $dst -Recurse -Force -ErrorAction SilentlyContinue }
Copy-Item -Path $src -Destination $DESTINO -Recurse -Force
Write-OK "Projeto copiado"

# ── Step 4: Extrair Node.js ──────────────────────────
Write-Step "Passo 4/8 - Extraindo Node.js..."
$nodeZip  = Join-Path $PENDRIVE "runtimes\node\node-v22.14.0-win-x64.zip"
$nodeDest = Join-Path $DESTINO "node"
if (-not (Test-Path $nodeDest)) {
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [IO.Compression.ZipFile]::ExtractToDirectory($nodeZip, $nodeDest)
        Write-OK "Node.js extraido"
    } catch {
        Write-Warn "Falha ao extrair via .NET ZipFile, tentando Expand-Archive..."
        try { Expand-Archive -Path $nodeZip -DestinationPath $nodeDest -Force; Write-OK "Node.js extraido" }
        catch { Write-Host "[ERRO] Nao foi possivel extrair Node.js: $_" -ForegroundColor Red; SafePause; exit 1 }
    }
} else { Write-OK "Node.js ja extraido" }

# ── Step 5: Instalar dependencias npm ─────────────────
Write-Step "Passo 5/8 - Instalando dependencias npm..."
$nodeDir = Get-ChildItem -Path $nodeDest -Directory | Select-Object -First 1
if (-not $nodeDir) { Write-Host "[ERRO] Pasta do Node nao encontrada em $nodeDest" -ForegroundColor Red; SafePause; exit 1 }
$npm  = Join-Path $nodeDir.FullName "npm.cmd"
$npx  = Join-Path $nodeDir.FullName "npx.cmd"
$proj = Join-Path $DESTINO "neon"

if (Test-Path $npm) {
    $env:Path = "$(Split-Path $npm);$env:Path"
    Set-Location $proj
    $env:NPMLOG = Join-Path $DESTINO "npm_install.log"

    if (Test-Path (Join-Path $proj "node_modules")) {
        Write-OK "node_modules ja existe, pulando npm install"
    } else {
        try {
            & $npm install --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
            Write-OK "Dependencias instaladas"
        } catch { Write-Warn "npm install falhou: $_" }
    }
} else {
    Write-Warn "npm nao encontrado em $npm"
}

# ── Step 6: Baixar/Verificar FFmpeg ──────────────────
Write-Step "Passo 6/8 - Verificando FFmpeg..."
$ffmpegDir = "C:\ffmpeg"
if (-not (Test-Path "$ffmpegDir\bin\ffmpeg.exe")) {
    Write-Host "  Baixando FFmpeg..." -ForegroundColor Yellow
    try {
        $ffZip = Join-Path $DESTINO "ffmpeg-release-full.7z"
        if (-not (Test-Path $ffZip)) {
            Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-full.7z" -OutFile $ffZip -UseBasicParsing
        }
        if (Test-Path $ffZip) {
            if (Get-Command "7z" -ErrorAction SilentlyContinue) { 7z x $ffZip "-o$ffmpegDir" -y | Out-Null; Write-OK "FFmpeg extraido" }
            else { Write-Warn "7z nao encontrado, baixe manualmente de: https://ffmpeg.org/download.html" }
        } else { Write-Warn "Download FFmpeg falhou" }
    } catch { Write-Warn "Falha ao baixar FFmpeg: $_" }
    if (Test-Path "$ffmpegDir\bin\ffmpeg.exe") {
        try { [Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "Machine") + ";C:\ffmpeg\bin", "Machine") } catch { Write-Warn "Nao foi possivel adicionar FFmpeg ao PATH (sem admin?)" }
    }
} else { Write-OK "FFmpeg ja instalado" }

# ── Step 7: Configurar .env ──────────────────────────
Write-Step "Passo 7/8 - Configurando variaveis de ambiente..."
$envFile = Join-Path $proj ".env"
$encFile = Join-Path $PENDRIVE "neon_env.enc"

if (Test-Path $envFile) {
    Write-OK ".env ja existe"
} elseif (Test-Path $encFile) {
    if (IsJobContext) {
        # Running in job - copy encrypted file as-is, user can decrypt later
        Copy-Item -Path $encFile -Destination (Join-Path $proj "neon_env.enc") -Force
        Write-Warn "neon_env.enc copiado (descriptografe manualmente em ambiente interativo)"
    } else {
        Write-Host "  Arquivo .env criptografado detectado." -ForegroundColor Yellow
        $tryCount = 0
        do {
            try {
                $sec = Read-Host "  Digite a senha do .env" -AsSecureString
                $ptr  = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
                $pass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
                $result = & "$PENDRIVE\installer\cripitar.js" "$encFile" "$envFile" "$pass" 2>&1
                if ($LASTEXITCODE -eq 0 -and (Test-Path $envFile)) { Write-OK ".env configurado"; break }
                else { Write-Warn "Senha incorreta. Tentativa $($tryCount+1)/3"; $tryCount++ }
            } catch { Write-Warn "Erro: $_"; $tryCount++ }
        } while ($tryCount -lt 3)
        if (-not (Test-Path $envFile)) { Write-Warn "Nao foi possivel descriptografar .env. Copie manualmente." }
    }
} else {
    Write-Warn "Arquivo neon_env.enc nao encontrado no pendrive."
}

# ── Step 8: Criar atalhos ────────────────────────────
Write-Step "Passo 8/8 - Criando atalhos..."
$wshell   = New-Object -ComObject wscript.shell
$desktop  = [Environment]::GetFolderPath("Desktop")
$startBat = Join-Path $proj "start.bat"
if (Test-Path $startBat) {
    $link = $wshell.CreateShortcut("$desktop\Neon.lnk")
    $link.TargetPath = "powershell.exe"
    $link.Arguments  = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startBat`""
    $link.WorkingDirectory = $proj
    $link.IconLocation = Join-Path $PENDRIVE "assets\neon.ico"
    $link.Save()
    Write-OK "Atalho Neon na area de trabalho"
}
if (Test-Path (Join-Path $proj "README.md")) {
    $link2 = $wshell.CreateShortcut("$desktop\Neon - Documentacao.lnk")
    $link2.TargetPath = Join-Path $proj "README.md"
    $link2.WorkingDirectory = $proj
    $link2.Save()
    Write-OK "Atalho Documentacao na area de trabalho"
}
if (Test-Path (Join-Path $proj "dashboard.html")) {
    $link3 = $wshell.CreateShortcut("$desktop\Neon - Dashboard.lnk")
    $link3.TargetPath = Join-Path $proj "dashboard.html"
    $link3.WorkingDirectory = $proj
    $link3.Save()
    Write-OK "Atalho Dashboard na area de trabalho"
}

# ── Concluido ─────────────────────────────────────────
Write-Step "Instalacao concluida!"
Write-Host ""
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host "|  NEON instalado com sucesso!              |" -ForegroundColor Cyan
Write-Host "|  Pasta: $DESTINO" -ForegroundColor Cyan
Write-Host "|  Atalho: Area de trabalho -> Neon.lnk     |" -ForegroundColor Cyan
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host ""

if (IsJobContext) {
    # Emit progress-compatible exit so parent job detects success
    Write-Progress -Activity "Concluido" -Status "Instalacao finalizada" -Completed
} else {
    SafePause
}
exit 0
