#Requires -Version 5.1
param([switch]$Silent)

$ErrorActionPreference = "Continue"
$Host.UI.RawUI.WindowTitle = "Instalar Neon v5.0"

function IsJobContext {
  if ($Silent) { return $true }
  $name = $Host.Name
  if ($name -ne "ConsoleHost" -and $name -ne "Windows PowerShell ISE Host") { return $true }
  return $false
}
function SafePause { if (-not (IsJobContext)) { Write-Host "`nPressione Enter para continuar..."; $null = Read-Host } }

$stepNames = @(
  "Verificando pendrive",
  "Preparando destino",
  "Copiando projeto",
  "Instalando Node.js",
  "Instalando dependencias",
  "Configurando FFmpeg",
  "Configurando ambiente",
  "Criando atalhos"
)

function Write-Step {
  param([int]$Num, [string]$Name, [string]$Detail)
  $pct = [Math]::Round(($Num - 1) / $stepNames.Count * 100)
  $msg = "Passo $Num/$($stepNames.Count) - $Name"
  Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $msg" -ForegroundColor Cyan
  if ($Detail) { Write-Host "  > $Detail" -ForegroundColor Gray }

  $statusMsg = if ($Detail) { "$Name`: $Detail" } else { $msg }
  $stepLabel = if ($Detail) { "$Name ($Detail)" } else { $Name }

  Write-Progress -Activity "Instalando Neon" -Status $statusMsg -CurrentOperation $Detail -PercentComplete $pct

  if ($env:NEON_INSTALL_PROGRESS) {
    Add-Content -Path $env:NEON_INSTALL_PROGRESS -Value "STEP:$Num"
    Add-Content -Path $env:NEON_INSTALL_PROGRESS -Value "NAME:$Name"
    Add-Content -Path $env:NEON_INSTALL_PROGRESS -Value "PCT:$pct"
    if ($Detail) { Add-Content -Path $env:NEON_INSTALL_PROGRESS -Value "DETAIL:$Detail" }
  }
}
function Write-OK { Write-Host "  [OK] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "  [!] $args" -ForegroundColor Yellow }

trap {
  $err = $_.Exception.Message
  Write-Host "`n[ERRO FATAL] $err" -ForegroundColor Red
  Add-Content -Path "$env:USERPROFILE\Desktop\neon_error.txt" -Value "[$(Get-Date)] FATAL: $err"
  if ($env:NEON_INSTALL_PROGRESS) {
    Add-Content -Path $env:NEON_INSTALL_PROGRESS -Value "ERROR:$err"
    Add-Content -Path $env:NEON_INSTALL_PROGRESS -Value "DONE"
  }
  if (-not (IsJobContext)) { Write-Host "`nPressione Enter para fechar..."; $null = Read-Host }
  exit 1
}

$PENDRIVE  = Split-Path -Parent $PSScriptRoot
$DESTINO   = Join-Path $env:USERPROFILE "Neon"
$LOG_FILE  = Join-Path $env:USERPROFILE "Desktop\neon_install_log.txt"

Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host "|      NEON - ASSISTENTE PESSOAL v5.0      |" -ForegroundColor Cyan
Write-Host "|      Instalacao otimizada (offline)       |" -ForegroundColor Cyan
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host ""

if (-not $Silent) {
  Write-Host "Isso vai instalar o Neon em: $DESTINO" -ForegroundColor Yellow
  Write-Host "  * Node.js portatil (zip incluso)"
  Write-Host "  * Projeto copiado do pendrive"
  Write-Host "  * Atalhos na area de trabalho"
  Write-Host "  * PC registrado para consulta remota"
  SafePause
}

$startTime = Get-Date

# ── Step 1 ────────────────────────
Write-Step -Num 1 -Name $stepNames[0] -Detail "Verificando arquivos necessarios"
$required = @(
    (Join-Path $PENDRIVE "installer\Instalador_Neon.ps1")
    (Join-Path $PENDRIVE "runtimes\node\node-v22.14.0-win-x64.zip")
    (Join-Path $PENDRIVE "neon")
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

# ── Step 2 ──────────────────────
Write-Step -Num 2 -Name $stepNames[1] -Detail "Criando $DESTINO"
New-Item -ItemType Directory -Path $DESTINO -Force | Out-Null
Write-OK "Pasta criada: $DESTINO"

# ── Step 3 ───────────────────────────
Write-Step -Num 3 -Name $stepNames[2] -Detail "Copiando arquivos do bot..."
$src = Join-Path $PENDRIVE "neon"
$dst = Join-Path $DESTINO "neon"
if (Test-Path $dst) {
  Write-Warn "Pasta ja existe, removendo versao anterior..."
  Remove-Item -Path $dst -Recurse -Force -ErrorAction SilentlyContinue
}
Copy-Item -Path $src -Destination $DESTINO -Recurse -Force

# Remove lixo do desenvolvimento
$lixos = @("bot_err.log", "bot_out.log", "logs")
foreach ($l in $lixos) {
  $p = Join-Path $dst $l
  if (Test-Path $p) { Remove-Item -Path $p -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-OK "Projeto copiado para $dst"

# ── Step 4 ──────────────────────────
Write-Step -Num 4 -Name $stepNames[3] -Detail "Extraindo Node.js portatil"
$nodeZip  = Join-Path $PENDRIVE "runtimes\node\node-v22.14.0-win-x64.zip"
$nodeDest = Join-Path $DESTINO "node"
if (-not (Test-Path $nodeDest)) {
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        Write-Step -Num 4 -Name $stepNames[3] -Detail "Descompactando via .NET ZipFile..."
        [IO.Compression.ZipFile]::ExtractToDirectory($nodeZip, $nodeDest)
        Write-OK "Node.js extraido"
    } catch {
        Write-Warn "Falha ao extrair via .NET ZipFile: $_"
        Write-Step -Num 4 -Name $stepNames[3] -Detail "Tentando Expand-Archive..."
        try { Expand-Archive -Path $nodeZip -DestinationPath $nodeDest -Force; Write-OK "Node.js extraido" }
        catch { Write-Host "[ERRO] Nao foi possivel extrair Node.js: $_" -ForegroundColor Red; SafePause; exit 1 }
    }
} else { Write-OK "Node.js ja extraido" }

# ── Step 5 ─────────────────────────
Write-Step -Num 5 -Name $stepNames[4] -Detail "Localizando npm..."
$nodeDir = Get-ChildItem -Path $nodeDest -Directory | Select-Object -First 1
if (-not $nodeDir) { Write-Host "[ERRO] Pasta do Node nao encontrada em $nodeDest" -ForegroundColor Red; SafePause; exit 1 }
$npm  = Join-Path $nodeDir.FullName "npm.cmd"
$npx  = Join-Path $nodeDir.FullName "npx.cmd"
$proj = Join-Path $DESTINO "neon"

if (Test-Path $npm) {
    $env:Path = "$(Split-Path $npm);$env:Path"
    Set-Location $proj

    if (Test-Path (Join-Path $proj "node_modules")) {
        Write-OK "node_modules ja existe, pulando npm install"
    } else {
        Write-Step -Num 5 -Name $stepNames[4] -Detail "Executando npm install (pode levar alguns minutos)..."
        $npmOutput = & $npm install --no-audit --no-fund 2>&1
        $npmExit = $LASTEXITCODE
        if ($npmExit -ne 0) {
            $npmLog = $npmOutput | Out-String
            Write-Host "[ERRO] npm install falhou (codigo $npmExit)" -ForegroundColor Red
            Write-Host "$npmLog" -ForegroundColor Gray
            Add-Content -Path "$env:USERPROFILE\Desktop\neon_npm_error.log" -Value $npmLog
            $choice = Read-Host "  Deseja tentar novamente? (S/N)"
            if ($choice -eq "S") {
              Write-Step -Num 5 -Name $stepNames[4] -Detail "Tentando novamente..."
              & $npm install --no-audit --no-fund 2>&1 | Out-Null
              if ($LASTEXITCODE -ne 0) {
                Write-Host "[ERRO] npm install falhou novamente. Continue manualmente com 'npm install'." -ForegroundColor Red
                SafePause; exit 1
              }
            } else { exit 1 }
        }
        Write-OK "Dependencias instaladas"
    }
} else {
    Write-Host "[ERRO] npm nao encontrado em $npm" -ForegroundColor Red
    SafePause; exit 1
}

# ── Step 6 ──────────────────────────
Write-Step -Num 6 -Name $stepNames[5] -Detail "Verificando FFmpeg..."
$ffmpegDir = "C:\ffmpeg"
if (-not (Test-Path "$ffmpegDir\bin\ffmpeg.exe")) {
    Write-Step -Num 6 -Name $stepNames[5] -Detail "Baixando FFmpeg (zip)..."
    try {
        $ffZip = Join-Path $DESTINO "ffmpeg-release-full.zip"
        if (-not (Test-Path $ffZip)) {
            Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-full.7z" -OutFile $ffZip -UseBasicParsing
        }
        if (Test-Path $ffZip) {
            if (Get-Command "7z" -ErrorAction SilentlyContinue) {
              Write-Step -Num 6 -Name $stepNames[5] -Detail "Extraindo com 7z..."
              7z x $ffZip "-o$ffmpegDir" -y | Out-Null
            } else {
              Write-Step -Num 6 -Name $stepNames[5] -Detail "Extraindo com Expand-Archive..."
              try { Expand-Archive -Path $ffZip -DestinationPath $ffmpegDir -Force }
              catch {
                Write-Warn "Falha ao extrair zip. Baixe manualmente."
              }
            }
            $ffBin = Get-ChildItem -Path $ffmpegDir -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
            if ($ffBin) {
              $targetBin = "$ffmpegDir\bin"
              if (-not (Test-Path $targetBin)) { New-Item -ItemType Directory -Path $targetBin -Force | Out-Null }
              Copy-Item -Path $ffBin.FullName -Destination "$targetBin\ffmpeg.exe" -Force
              Write-OK "FFmpeg instalado em $ffmpegDir"
            }
        } else { Write-Warn "Download FFmpeg falhou" }
    } catch { Write-Warn "Falha ao baixar FFmpeg: $_" }
    if (Test-Path "$ffmpegDir\bin\ffmpeg.exe") {
        try { [Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "Machine") + ";C:\ffmpeg\bin", "Machine") } catch { Write-Warn "Nao foi possivel adicionar FFmpeg ao PATH (sem admin?)" }
    }
} else { Write-OK "FFmpeg ja instalado" }

# ── Step 7 ──────────────────────────
Write-Step -Num 7 -Name $stepNames[6] -Detail "Verificando .env..."
$envFile = Join-Path $proj ".env"
$encFile = Join-Path $PENDRIVE "installer\neon_env.enc"

if (Test-Path $envFile) {
    Write-OK ".env ja existe"
} elseif (Test-Path $encFile) {
    if (IsJobContext) {
        Copy-Item -Path $encFile -Destination (Join-Path $proj "neon_env.enc") -Force
        Write-Warn "neon_env.enc copiado (descriptografe manualmente)"
    } else {
        Write-Host "  Arquivo .env criptografado detectado." -ForegroundColor Yellow
        $tryCount = 0
        do {
            try {
                $sec = Read-Host "  Digite a senha do .env" -AsSecureString
                $ptr  = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
                $pass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)

                $cripitar = Join-Path $PENDRIVE "installer\cripitar.js"
                $jsonInput = @{ action="decrypt"; input=$encFile; output=$envFile; password=$pass } | ConvertTo-Json -Compress
                $result = $jsonInput | & "$($nodeDir.FullName)\node.exe" "$cripitar" 2>&1
                if ($LASTEXITCODE -eq 0 -and (Test-Path $envFile)) { Write-OK ".env configurado"; break }
                else { Write-Warn "Senha incorreta. Tentativa $($tryCount+1)/3"; $tryCount++ }
            } catch { Write-Warn "Erro: $_"; $tryCount++ }
        } while ($tryCount -lt 3)
        if (-not (Test-Path $envFile)) { Write-Warn "Nao foi possivel descriptografar .env. Copie manualmente." }
    }
} else {
    Write-Warn "Arquivo neon_env.enc nao encontrado."
}

Write-Step -Num 7 -Name $stepNames[6] -Detail "Registrando PC para consulta remota..."
$pcInfo = @{
  hostname = $env:COMPUTERNAME
  usuario = $env:USERNAME
  installedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
  installVersion = "5.0"
} | ConvertTo-Json
$pcInfo | Out-File -FilePath (Join-Path $proj "neon_pc.json") -Encoding utf8
Write-OK "PC registrado: $env:COMPUTERNAME"

# ── Step 8 ────────────────────────────
Write-Step -Num 8 -Name $stepNames[7] -Detail "Criando atalhos..."
$wshell   = New-Object -ComObject wscript.shell
$desktop  = [Environment]::GetFolderPath("Desktop")
$startBat = Join-Path $proj "start.bat"
if (Test-Path $startBat) {
    $link = $wshell.CreateShortcut("$desktop\Neon.lnk")
    $link.TargetPath = "cmd.exe"
    $link.Arguments  = "/c `"`"$startBat`"`""
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

$duration = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)

# ── Concluido ─────────────────────────
Write-Step -Num ($stepNames.Count+1) -Name "Concluido" -Detail "Instalacao finalizada em ${duration}s"
Write-Host ""
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host "|  NEON instalado com sucesso!              |" -ForegroundColor Cyan
Write-Host "|  PC: $env:COMPUTERNAME" -ForegroundColor Cyan
Write-Host "|  Pasta: $DESTINO" -ForegroundColor Cyan
Write-Host "|  Atalho: Area de trabalho -> Neon.lnk     |" -ForegroundColor Cyan
Write-Host "|  Tempo: ${duration}s                       |" -ForegroundColor Cyan
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host ""

Write-Progress -Activity "Concluido" -Status "Instalacao finalizada" -Completed
if ($env:NEON_INSTALL_PROGRESS) { Add-Content -Path $env:NEON_INSTALL_PROGRESS -Value "DONE" }
if (-not (IsJobContext)) { SafePause }
exit 0
