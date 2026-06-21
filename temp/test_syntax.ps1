$files = @(
  'C:\Meus Projetos\Neon\pendrive\installer\Instalador_Neon.ps1',
  'C:\Meus Projetos\Neon\pendrive\installer\Desinstalar_Neon.ps1',
  'C:\Meus Projetos\Neon\pendrive\installer\Instalador_Neon_GUI.ps1',
  'C:\Meus Projetos\Neon\pendrive\installer\Desinstalar_Neon_GUI.ps1'
)
$ok = $true
foreach ($f in $files) {
  $tokens = $null
  $errs = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$tokens, [ref]$errs)
  if ($errs) {
    Write-Host "[ERRO] $f" -ForegroundColor Red
    foreach ($e in $errs) { Write-Host "  $e" -ForegroundColor Red }
    $ok = $false
  } else {
    Write-Host "[OK] $f" -ForegroundColor Green
  }
}
if ($ok) { Write-Host "`nTodos validados!" -ForegroundColor Green }
