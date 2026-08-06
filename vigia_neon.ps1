# vigia_neon.ps1 - vigia da Neon: mantem o bot ligado automaticamente
# Uso: rodar no login e a cada poucos minutos (Agendador do Windows).
# Se a Neon nao estiver de pe (API 3000 fora do ar e sem processo node),
# inicia a Neon em segundo plano com log em logs\.
$ErrorActionPreference = "SilentlyContinue"
$dir = "C:\Users\Pichau\Neon"
$node = "C:\Program Files\nodejs\node.exe"
$vigiaLog = Join-Path $dir "logs\vigia.log"
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$api = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
$nodeProc = @(Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $node })

if (-not $api -and $nodeProc.Count -eq 0) {
    $out = Join-Path $dir "logs\vigia_stdout.log"
    $err = Join-Path $dir "logs\vigia_stderr.log"
    Start-Process -FilePath $node -ArgumentList "index.js" -WorkingDirectory $dir -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
    Add-Content $vigiaLog ("{0} | Neon reiniciada pelo vigia" -f $stamp)
} else {
    Add-Content $vigiaLog ("{0} | Neon OK (API {1} / node {2})" -f $stamp, [bool]$api, $nodeProc.Count)
}
