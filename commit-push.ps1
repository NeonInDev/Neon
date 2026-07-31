param(
    [string]$Mensagem = "",
    [string]$Arquivos = "."
)

$ErrorActionPreference = "Stop"

if (-not $Mensagem) {
    $Mensagem = Read-Host "Mensagem do commit"
}

git add $Arquivos
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git status

$confirmar = Read-Host "`nConfirma o commit? (s/N)"
if ($confirmar -ne "s" -and $confirmar -ne "S") {
    Write-Host "Commit cancelado." -ForegroundColor Yellow
    exit 1
}

git commit -m $Mensagem
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git push origin main
if ($LASTEXITCODE -eq 0) {
    Write-Host "`nPush realizado com sucesso!" -ForegroundColor Green
}
