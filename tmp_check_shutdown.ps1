$evt = Get-WinEvent -FilterHashtable @{LogName='System'; Id=41} -MaxEvents 1 -ErrorAction SilentlyContinue
if ($evt) {
  Write-Output $evt.TimeCreated.ToString('dd/MM/yyyy HH:mm:ss')
} else {
  Write-Output 'none'
}