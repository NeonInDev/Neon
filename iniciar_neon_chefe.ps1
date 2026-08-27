# Inicia a Neon no modo mais leve (sem MCPs) e garante que ela chame o dono de "chefe"
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\Pichau\Neon\iniciar_neon_chefe.ps1
$ErrorActionPreference = "Stop"
$Neon = "C:\Users\Pichau\Neon"

Write-Host "==> Aplicando patch 'chefe'..."
& node (Join-Path $Neon "patch_chefe.js")
if ($LASTEXITCODE -ne 0) { Write-Host "Falha no patch. Abortando." -ForegroundColor Red; exit 1 }

Write-Host "==> Validando sintaxe de src/ai.js..."
& node --check (Join-Path $Neon "src\ai.js")
if ($LASTEXITCODE -ne 0) { Write-Host "Sintaxe invalida em ai.js. Abortando." -ForegroundColor Red; exit 1 }

Write-Host "==> Desligando MCPs (backup de opencode.json)..."
$oc = Join-Path $Neon "opencode.json"
$bak = Join-Path $Neon "opencode.json.chefe.bak"
if (-not (Test-Path -LiteralPath $bak)) { Copy-Item -LiteralPath $oc -Destination $bak }
$json = Get-Content -LiteralPath $oc -Raw | ConvertFrom-Json
$json.mcp.pc.enabled = $false
$json.mcp.celular.enabled = $false
$json.mcp.voice.enabled = $false
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($oc, ($json | ConvertTo-Json -Depth 10), $utf8NoBom)
& node -e "JSON.parse(require('fs').readFileSync('$($oc.Replace('\','/'))','utf8')); console.log('opencode.json valido')"
if ($LASTEXITCODE -ne 0) { Write-Host "opencode.json invalido. Abortando." -ForegroundColor Red; exit 1 }

Write-Host "==> Encerrando processos node antigos (nao mexe no opencode)..."
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$out = Join-Path $env:TEMP "opencode\neon_chefe_out.log"
$err = Join-Path $env:TEMP "opencode\neon_chefe_err.log"
Write-Host "==> Iniciando node index.js (sem MCPs)..."
$p = Start-Process node -ArgumentList "index.js" -WorkingDirectory $Neon -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden -PassThru

$online = $false
for ($i = 1; $i -le 60; $i++) {
  Start-Sleep -Seconds 1
  if ($p.HasExited) { Write-Host "Neon saiu antes de subir (code $($p.ExitCode))." -ForegroundColor Red; break }
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/status" -TimeoutSec 2 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $online = $true; break }
  } catch {}
}

if ($online) { Write-Host "`nNeon ONLINE em http://127.0.0.1:3000" -ForegroundColor Green }
else { Write-Host "`nNeon pode nao ter subido. Veja os logs abaixo." -ForegroundColor Yellow }

Write-Host "=== RAM dos processos node ==="
Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id, @{N='RAM_MB';E={[math]::Round($_.WorkingSet64/1MB,1)}}, StartTime | Format-Table -AutoSize
Write-Host "=== ultimas linhas do log ==="
Get-Content $out -Tail 15 -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "Backup do opencode.json completo: opencode.json.chefe.bak"
Write-Host "Para restaurar MCPs depois: Copy-Item opencode.json.chefe.bak opencode.json"
