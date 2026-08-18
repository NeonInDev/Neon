param(
  [int]$MaxMin = 30,
  [switch]$Forcar
)
# Hiberna o PC com seguranca: so hiberna se nenhum instalador/tarefa critica estiver rodando.
# Evita corromper instalacoes em andamento (ex.: winget, msiexec, npm install, downloads grandes).

# Instaladores que, se ativos, impedem hibernar (risco de corromper instalacao).
# Node/python NAO bloqueiam: a Neon roda em node o tempo todo e a hibernacao restaura tudo.
$procCriticos = @(
  "msiexec", "setup", "setup64", "installer",
  "winget", "choco", "scoop",
  "7z", "winrar", "aria2c", "xcopy", "robocopy"
)

function Test-InstaladorRodando {
  $nomes = Get-Process -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName
  $achou = @()
  foreach ($c in $procCriticos) {
    if ($nomes -contains $c) { $achou += $c }
  }
  return $achou
}

$inicio = Get-Date
while ($true) {
  $achou = Test-InstaladorRodando
  if ($achou.Count -eq 0 -or $Forcar) {
    if ($Forcar -and $achou.Count -gt 0) {
      Write-Host "[AVISO] Forcando hibernacao mesmo com: $($achou -join ', ')"
    }
    break
  }
  Write-Host "[AGUARDANDO] Instalador rodando: $($achou -join ', '). Tentando de novo em 60s..."
  Start-Sleep -Seconds 60
  if (((Get-Date) - $inicio).TotalMinutes -ge $MaxMin) {
    Write-Host "[LIMITE] Passou $MaxMin min com instalador ativo. Adiando hibernacao."
    exit 2
  }
}

Write-Host "[HIBERNAR] Nenhuma tarefa critica em andamento. Hibernando..."
powercfg /hibernate on 2>$null
rundll32.exe powrprof.dll,SetSuspendState 0,1,0
Write-Host "[OK] Comando de hibernacao enviado."