$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem
$ramTotal = $os.TotalVisibleMemorySize
$ramFree = $os.FreePhysicalMemory
$ramPct = [math]::Round(($ramTotal - $ramFree) / $ramTotal * 100)
$disk = Get-PSDrive C | Select-Object @{N='Pct';E={[math]::Round(($_.Used+1)/($_.Used+$_.Free)*100)}}
$uptime = (Get-Date) - $os.LastBootUpTime
$hostname = $env:COMPUTERNAME
try { $temp = (Get-WmiObject -Namespace root/wmi -Class MSAcpi_ThermalZoneTemperature -ErrorAction Stop | Select-Object -First 1).CurrentTemperature; $tempC = [math]::Round($temp/10 - 273.15, 1) } catch { $tempC = "N/A" }
Write-Output "== Sistema =="
Write-Output "PC: ${hostname}"
Write-Output "Uptime: $($uptime.Days)d $($uptime.Hours)h $($uptime.Minutes)min"
Write-Output ""
Write-Output "== Hardware =="
Write-Output "CPU: ${cpu}%"
Write-Output "RAM: ${ramPct}%"
Write-Output "Disco: $($disk.Pct)%"
Write-Output "Temp: ${tempC}°C"
