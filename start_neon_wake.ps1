$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $root ".neon-opencode"
$pidPath = Join-Path $runtimeDir "wake.pid"
$outPath = Join-Path $runtimeDir "wake.stdout.log"
$errorPath = Join-Path $runtimeDir "wake.stderr.log"
$node = (Get-Command node.exe -ErrorAction Stop).Source

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
if (Test-Path -LiteralPath $pidPath) {
  $savedPid = [int](Get-Content -LiteralPath $pidPath -Raw).Trim()
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $savedPid" -ErrorAction SilentlyContinue
  if ($process -and $process.ExecutablePath -eq $node -and $process.CommandLine -match 'neon_wake\.js') {
    Write-Output "O ouvinte de ativação já está ativo."
    exit 0
  }
  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
}

$wake = Start-Process -FilePath $node -ArgumentList (Join-Path $root "src\neon_wake.js") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $outPath -RedirectStandardError $errorPath -PassThru
Set-Content -LiteralPath $pidPath -Value $wake.Id -NoNewline
Write-Output "Ouvinte de ativação iniciado (PID $($wake.Id))."
