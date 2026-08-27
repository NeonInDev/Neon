# ============================================================
# Neon - Renova certificado HTTPS do Tailscale (Let's Encrypt)
# Gera o cert oficial, converte para .pfx e reinicia a Neon.
# Executar: powershell -File scripts\renovar_cert_neon.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$TS = "C:\Program Files\Tailscale\tailscale.exe"
$OPENSSL = "C:\Program Files\Git\usr\bin\openssl.exe"
$HOSTNAME = "neon-world.tail7b15b0.ts.net"
$WORKDIR = Join-Path $env:TEMP "neon_tscert"
$SSL_DIR = "C:\Users\Pichau\neon\ssl"
$NEON_DIR = "C:\Users\Pichau\neon"
$LOG = Join-Path $NEON_DIR "logs\cert_renew.log"
$PASS = $env:SSL_PASS

if (-not $PASS) {
  $envLine = Get-Content (Join-Path $NEON_DIR ".env") -ErrorAction SilentlyContinue | Where-Object { $_ -match "^SSL_PASS=" }
  if ($envLine) { $PASS = ($envLine -split "=",2)[1].Trim().Trim('"') }
}
if (-not $PASS) {
  Write-Output "[ERRO] SSL_PASS nao encontrado no .env"
  exit 1
}

$crt = Join-Path $WORKDIR "neon.crt"
$key = Join-Path $WORKDIR "neon.key"
$pfx = Join-Path $WORKDIR "neon_tls.pfx"

function Log([string]$msg) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$ts] $msg"
  Add-Content -Path $LOG -Value $line
  Write-Output $line
}

New-Item -ItemType Directory -Force -Path $WORKDIR, (Split-Path $LOG) | Out-Null

Log "Renovando certificado TLS do Tailscale..."

# 1) Gerar certificado (se expirar em menos de ~30 dias, regenera)
$renew = $true
if (Test-Path $pfx) {
  try {
    Add-Type -AssemblyName System.Security
    $c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($pfx, $PASS)
    $dias = ($c.NotAfter - (Get-Date)).TotalDays
    Log "Cert atual expira em $([int]$dias) dias."
    if ($dias -gt 30) { $renew = $false }
  } catch {}
}

if ($renew) {
  & $TS cert --cert-file $crt --key-file $key $HOSTNAME 2>&1 | Out-Null
  if (-not (Test-Path $crt) -or -not (Test-Path $key)) {
    Log "[ERRO] tailscale cert falhou. HTTPS do Tailscale esta habilitado? (admin console -> DNS -> HTTPS)"
    exit 1
  }
  Log "Cert gerado pelo Tailscale."

  # 2) Converter para .pfx
  & $OPENSSL pkcs12 -export -out $pfx -inkey $key -in $crt -password "pass:$PASS" 2>&1 | Out-Null
  if (-not (Test-Path $pfx)) {
    Log "[ERRO] Falha ao converter para pfx."
    exit 1
  }
  Log "Convertido para pfx."

  # 3) Copiar para o ssl da Neon
  Copy-Item $pfx (Join-Path $SSL_DIR "neon.pfx") -Force
  Log "pfx copiado para ssl/."

  # 4) Reiniciar a Neon para carregar o novo cert
  $node = Get-Process -Name "node" -ErrorAction SilentlyContinue |
          Where-Object { $_.Id -ne 3656 } | Select-Object -First 1
  if ($node) {
    Stop-Process -Id $node.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
  Start-Process -FilePath "node" -ArgumentList "index.js" -WorkingDirectory $NEON_DIR -WindowStyle Hidden
  Start-Sleep -Seconds 6
  Log "Neon reiniciada com o novo certificado."
} else {
  Log "Certificado ainda valido, nada a fazer."
}

Log "Concluido. HUD HTTPS: https://$HOSTNAME`/hud"
