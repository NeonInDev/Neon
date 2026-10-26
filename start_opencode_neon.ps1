param([switch]$Stop)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $root ".env"
$runtimeDir = Join-Path $root ".neon-opencode"
$pidPath = Join-Path $runtimeDir "server.pid"
$logPath = Join-Path $runtimeDir "server.log"
$errorPath = Join-Path $runtimeDir "server-error.log"
$binary = Join-Path $env:APPDATA "npm\node_modules\opencode-ai\bin\opencode.exe"

if ($Stop) {
  if (-not (Test-Path -LiteralPath $pidPath)) {
    Write-Output "Não encontrei um PID salvo para o servidor da Neon."
    exit 0
  }
  $serverPid = [int](Get-Content -LiteralPath $pidPath -Raw).Trim()
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid" -ErrorAction SilentlyContinue
  if ($processInfo -and $processInfo.ExecutablePath -eq $binary) {
    Stop-Process -Id $serverPid -Force
    Remove-Item -LiteralPath $pidPath -Force
    Write-Output "Servidor OpenCode da Neon encerrado."
  } else {
    Remove-Item -LiteralPath $pidPath -Force
    Write-Output "O processo salvo já não está ativo."
  }
  exit 0
}

if (-not (Test-Path -LiteralPath $envPath)) { throw "Não encontrei o .env do projeto: $envPath" }
$allowed = @("OPENROUTER_API_KEY", "OPENCODE_MODEL", "OPENCODE_PORT", "OPENCODE_SERVER_USERNAME", "OPENCODE_SERVER_PASSWORD")
foreach ($line in [System.IO.File]::ReadLines($envPath)) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
    $name = $Matches[1]
    if ($allowed -notcontains $name) { continue }
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and (($value[0] -eq '"' -and $value[$value.Length - 1] -eq '"') -or ($value[0] -eq "'" -and $value[$value.Length - 1] -eq "'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    Set-Item -Path "Env:$name" -Value $value
  }
}

if (-not $env:OPENROUTER_API_KEY) { throw "OPENROUTER_API_KEY está vazio no .env." }
if (-not $env:OPENCODE_SERVER_PASSWORD) { throw "OPENCODE_SERVER_PASSWORD está vazio no .env." }
if (-not (Test-Path -LiteralPath $binary)) { throw "Não encontrei o executável OpenCode instalado: $binary" }

$port = 4096
if ($env:OPENCODE_PORT) { $port = [int]$env:OPENCODE_PORT }
if ($port -lt 1024 -or $port -gt 65535) { throw "OPENCODE_PORT precisa estar entre 1024 e 65535." }
$env:XDG_DATA_HOME = Join-Path $runtimeDir "data"
$env:XDG_CONFIG_HOME = Join-Path $runtimeDir "config"
$env:XDG_STATE_HOME = Join-Path $runtimeDir "state"
$env:XDG_CACHE_HOME = Join-Path $runtimeDir "cache"
$env:OPENCODE_DISABLE_AUTOUPDATE = "true"
$env:OPENCODE_SERVER_USERNAME = if ($env:OPENCODE_SERVER_USERNAME) { $env:OPENCODE_SERVER_USERNAME } else { "opencode" }

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$authBytes = [System.Text.Encoding]::UTF8.GetBytes("${env:OPENCODE_SERVER_USERNAME}:$env:OPENCODE_SERVER_PASSWORD")
$headers = @{ Authorization = "Basic $([Convert]::ToBase64String($authBytes))" }
$healthUrl = "http://127.0.0.1:$port/global/health"
$tcp = [System.Net.Sockets.TcpClient]::new()
$busy = $false
try { $tcp.Connect("127.0.0.1", $port); $busy = $true } catch {} finally { $tcp.Dispose() }
if ($busy) {
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -Headers $headers -TimeoutSec 3
    if ($health.healthy -eq $true) {
      Write-Output "Servidor OpenCode da Neon já está ativo em http://127.0.0.1:$port. PID $((Get-CimInstance Win32_Process -Filter "Name = 'opencode.exe'" | Where-Object { $_.ExecutablePath -eq $binary } | Select-Object -First 1 -ExpandProperty ProcessId))."
      exit 0
    }
  } catch {}
  throw "A porta $port já está ocupada por outro serviço."
}

$server = Start-Process -FilePath $binary -ArgumentList @("serve", "--port", [string]$port, "--hostname", "127.0.0.1", "--print-logs") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError $errorPath -PassThru
Set-Content -LiteralPath $pidPath -Value $server.Id -NoNewline
for ($i = 0; $i -lt 25; $i++) {
  Start-Sleep -Seconds 1
  $server.Refresh()
  if ($server.HasExited) {
    $details = @((Get-Content -LiteralPath $logPath -Tail 30 -ErrorAction SilentlyContinue) + (Get-Content -LiteralPath $errorPath -Tail 30 -ErrorAction SilentlyContinue)) -join "`n"
    throw "OpenCode encerrou ao iniciar. $details"
  }
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -Headers $headers -TimeoutSec 2
    if ($health.healthy -eq $true) {
      Write-Output "Servidor OpenCode da Neon está ativo em http://127.0.0.1:$port. PID $($server.Id)."
      Write-Output "Documentação da API: http://127.0.0.1:$port/doc"
      Write-Output "Para encerrar: .\start_opencode_neon.ps1 -Stop"
      exit 0
    }
  } catch {}
}
throw "OpenCode iniciou, mas não confirmou a API em $healthUrl. Veja os logs em $runtimeDir."
