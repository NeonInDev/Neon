function IsJobContext {
  param([switch]$Silent)
  if ($Silent) { Write-Host "  Silent=True -> JobContext"; return $true }
  try {
    if ($null -eq $Host.UI.RawUI) { Write-Host "  RawUI null -> JobContext"; return $true }
    $result = -not $Host.UI.RawUI.KeyAvailable
    Write-Host "  KeyAvailable=$($Host.UI.RawUI.KeyAvailable) -> $(if($result){'JobContext'}else{'Interactive'})"
    return $result
  } catch {
    Write-Host "  Exception -> JobContext"
    return $true
  }
}

Write-Host "Teste direto (interativo esperado):"
IsJobContext

Write-Host "`nTeste com -Silent (JobContext esperado):"
IsJobContext -Silent

Write-Host "`nTeste via Start-Job (JobContext esperado):"
$j = Start-Job -ScriptBlock {
  function IsJobContext {
    param([switch]$Silent)
    if ($Silent) { return "Silent" }
    try {
      if ($null -eq $Host.UI.RawUI) { return "RawUI null" }
      $result = -not $Host.UI.RawUI.KeyAvailable
      return "KeyAvailable=$($Host.UI.RawUI.KeyAvailable) => $(if($result){'Job'}else{'Interactive'})"
    } catch { return "Exception: $_" }
  }
  Write-Host "  Sem Silent: $(IsJobContext)"
  Write-Host "  Com Silent: $(IsJobContext -Silent)"
}
$j | Wait-Job | Receive-Job
