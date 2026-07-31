param(
    [string]$Mensagem = "",
    [switch]$Watch,
    [int]$IntervaloSegundos = 30
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Push-Neon {
    git add -A
    $status = git status --porcelain
    if (-not $status) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Nada para commitar." -ForegroundColor DarkGray
        return
    }

    if (-not $Mensagem) {
        $Mensagem = "auto: atualizacao $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    }

    git commit -m $Mensagem
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Commit falhou." -ForegroundColor Red
        return
    }

    for ($tentativa = 1; $tentativa -le 3; $tentativa++) {
        git push origin main 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Commit + push OK: $($status.Count) arquivo(s)" -ForegroundColor Green
            return
        }
        Start-Sleep -Seconds 10
    }
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Push falhou apos 3 tentativas" -ForegroundColor Red
}

if ($Watch) {
    Write-Host "Modo observador: verificando mudancas a cada $IntervaloSegundos s. Ctrl+C para parar."
    Push-Neon
    while ($true) {
        Start-Sleep -Seconds $IntervaloSegundos
        Push-Neon
    }
}
else {
    Push-Neon
}
