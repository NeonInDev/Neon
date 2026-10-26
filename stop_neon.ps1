$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $root ".neon-opencode"
$pidPath = Join-Path $runtimeDir "neon.pid"
$envPath = Join-Path $root ".env"

if (-not (Test-Path -LiteralPath $pidPath)) {
  Write-Output "Não encontrei PID da Neon; ela pode já estar encerrada."
  exit 0
}
$savedPid = [int](Get-Content -LiteralPath $pidPath -Raw).Trim()
$master = $null
foreach ($line in [System.IO.File]::ReadLines($envPath)) {
  if ($line -match '^\s*MASTER_KEY\s*=\s*(.*)$') {
    $master = $Matches[1].Trim()
    if ($master.Length -ge 2 -and (($master[0] -eq '"' -and $master[$master.Length - 1] -eq '"') -or ($master[0] -eq "'" -and $master[$master.Length - 1] -eq "'"))) {
      $master = $master.Substring(1, $master.Length - 2)
    }
  }
}
if ($master) {
  try {
    Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3000/api/shutdown" -Headers @{ "x-hud-key" = $master } -ContentType "application/json" -Body "{}" -TimeoutSec 5 | Out-Null
  } catch {}
}

for ($i = 0; $i -lt 10; $i++) {
  if (-not (Get-Process -Id $savedPid -ErrorAction SilentlyContinue)) {
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
    Write-Output "Neon encerrada."
    exit 0
  }
  Start-Sleep -Seconds 1
}
Write-Output "O pedido de encerramento foi enviado. Se ela continuar ativa, verifique o log em .neon-opencode."
