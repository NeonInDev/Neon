$drive = Get-WmiObject Win32_Volume -Filter "DriveLetter = 'D:'"
if ($drive) {
  Write-Host "Ejetando D:..."
  $drive.Dismount($false, $false)
  Start-Sleep 2
  Write-Host "Pronto! Pode remover o pendrive."
} else {
  Write-Host "Drive D: nao encontrado"
}
