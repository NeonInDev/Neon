$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem
$ramTotal = $os.TotalVisibleMemorySize
$ramFree = $os.FreePhysicalMemory
$ramPct = [math]::Round(($ramTotal - $ramFree) / $ramTotal * 100)
$disk = Get-PSDrive C | Select-Object @{N='Pct';E={[math]::Round(($_.Used+1)/($_.Used+$_.Free)*100)}}
$uptime = (Get-Date) - $os.LastBootUpTime
$hostname = $env:COMPUTERNAME
$cpuModel = (Get-CimInstance Win32_Processor).Name

$temp = "N/A"

# Method 1: LibreHardwareMonitor WMI (if running)
try {
  $lhm = Get-CimInstance -Namespace root/LibreHardwareMonitor -ClassName Sensor -ErrorAction Stop | Where-Object { $_.SensorType -eq "Temperature" -and $_.Name -eq "CPU Package" }
  if ($lhm) { $t = @($lhm)[0].Value; if ($t -and $t -gt 0) { $temp = [math]::Round($t, 1) } }
} catch {}

# Method 2: MSAcpi_ThermalZoneTemperature (root/wmi)
if ($temp -eq "N/A") {
  try {
    $t = (Get-WmiObject -Namespace root/wmi -Class MSAcpi_ThermalZoneTemperature -ErrorAction Stop | Select-Object -First 1).CurrentTemperature
    if ($t -and $t -gt 0) { $temp = [math]::Round($t/10 - 273.15, 1) }
  } catch {}
}

# Method 3: Win32_PerfFormattedData_Counters_ThermalZoneInformation
if ($temp -eq "N/A") {
  try {
    $data = Get-WmiObject -Query "SELECT * FROM Win32_PerfFormattedData_Counters_ThermalZoneInformation" -Namespace "root/cimv2" -ErrorAction Stop
    if ($data) {
      $t = @($data)[0].HighPrecisionTemperature
      if ($t -and $t -gt 0) { $temp = [math]::Round($t / 10, 1) }
    }
  } catch {}
}

# Method 4: Get-Counter
if ($temp -eq "N/A") {
  try {
    $c = (Get-Counter "\Thermal Zone Information\Temperature" -ErrorAction Stop -SampleInterval 1 -MaxSamples 1).CounterSamples[0].CookedValue
    if ($c -and $c -gt 0) { $temp = [math]::Round($c, 1) }
  } catch {}
}

Write-Output "== Sistema =="
Write-Output "PC: ${hostname}"
Write-Output "CPU: ${cpuModel}"
Write-Output "Uptime: $($uptime.Days)d $($uptime.Hours)h $($uptime.Minutes)min"
Write-Output ""
Write-Output "== Hardware =="
Write-Output "CPU: ${cpu}%"
Write-Output "RAM: ${ramPct}%"
Write-Output "Disco: $($disk.Pct)%"
Write-Output "Temp: ${temp}°C"