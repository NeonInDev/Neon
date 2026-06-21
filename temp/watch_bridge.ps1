$bridgeFile = "C:\Meus Projetos\Neon\temp\opencode_bridge.json"
$lastCount = 0

Write-Host "=== Bridge Watcher ===" -ForegroundColor Cyan
Write-Host "Aguardando tasks do Neon..." -ForegroundColor Gray

while ($true) {
  try {
    if (Test-Path $bridgeFile) {
      $data = Get-Content $bridgeFile -Raw | ConvertFrom-Json
      $pending = $data.tasks | Where-Object { $_.status -eq "pending" }
      $newTasks = $pending | Where-Object { $_.id -notin $global:seen }
      foreach ($task in $newTasks) {
        Write-Host ""
        Write-Host "=== NOVA TASK DO NEON ===" -ForegroundColor Yellow
        Write-Host "ID: $($task.id)" -ForegroundColor Cyan
        Write-Host "Prompt: $($task.prompt)" -ForegroundColor White
        Write-Host "Usuario: $($task.userId)" -ForegroundColor Gray
        Write-Host "=========================" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Para executar, use no terminal:" -ForegroundColor Green
        Write-Host "  node -e `"const b=require('./src/bridge'); const t=b.getProximaTask(); if(t){ console.log('Task:', t.prompt); /* executa aqui */ b.concluirTask(t.id, 'resultado'); }`"" -ForegroundColor Cyan
        Write-Host ""
        $global:seen = @($global:seen) + $task.id
      }
      if (-not $global:seen) { $global:seen = @() }
      $currentCount = ($data.tasks | Where-Object { $_.status -eq "pending" }).Count
      if ($currentCount -ne $lastCount) {
        $lastCount = $currentCount
        if ($currentCount -gt 0) {
          Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $currentCount task(s) pendente(s)" -ForegroundColor Yellow
        }
      }
    }
  } catch {}
  Start-Sleep -Seconds 3
}
