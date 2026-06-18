$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem
$ramTotal = $os.TotalVisibleMemorySize
$ramFree = $os.FreePhysicalMemory
$ramPct = [math]::Round(($ramTotal - $ramFree) / $ramTotal * 100)
$disk = Get-PSDrive C | Select-Object @{N='Pct';E={[math]::Round(($_.Used+1)/($_.Used+$_.Free)*100)}}
$uptime = (Get-Date) - $os.LastBootUpTime
$hostname = $env:COMPUTERNAME
Write-Output "CPU:${cpu}% RAM:${ramPct}% Disco:$($disk.Pct)% Uptime:$($uptime.Days)d $($uptime.Hours)h $($uptime.Minutes)min PC:${hostname}"
