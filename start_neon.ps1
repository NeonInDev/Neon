$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $root ".neon-opencode"
$pidPath = Join-Path $runtimeDir "neon.pid"
$outPath = Join-Path $runtimeDir "neon.stdout.log"
$errorPath = Join-Path $runtimeDir "neon.stderr.log"
$node = (Get-Command node.exe -ErrorAction Stop).Source

# Keep OpenCode available even when the Neon API itself is already running.
& (Join-Path $root "start_opencode_neon.ps1")

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:3000/health" -TimeoutSec 2
  if ($health.version -eq "2.0.0") {
    Write-Output "Neon já está ativa. API: http://127.0.0.1:3000/doc"
    exit 0
  }
} catch {}

if (Test-Path -LiteralPath $pidPath) {
  $savedPid = [int](Get-Content -LiteralPath $pidPath -Raw).Trim()
  $existing = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
  if ($existing -and $existing.Path -eq $node) {
    Write-Output "Neon já está ativa. API: http://127.0.0.1:3000/doc"
    exit 0
  }
  Remove-Item -LiteralPath $pidPath -Force
}

$tcp = [System.Net.Sockets.TcpClient]::new()
$portBusy = $false
try { $tcp.Connect("127.0.0.1", 3000); $portBusy = $true } catch {} finally { $tcp.Dispose() }
if ($portBusy) { throw "A porta 3000 está ocupada; não vou iniciar outra cópia da Neon." }

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$process = Start-Process -FilePath $node -ArgumentList (Join-Path $root "index.js") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $outPath -RedirectStandardError $errorPath -PassThru
Set-Content -LiteralPath $pidPath -Value $process.Id -NoNewline
Write-Output "Neon iniciada (PID $($process.Id)). API: http://127.0.0.1:3000/doc"
Write-Output "OpenCode: http://127.0.0.1:4096/doc (autenticação do .env)."
