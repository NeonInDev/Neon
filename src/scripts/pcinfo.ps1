Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
namespace Neon {
public static class Native {
  [DllImport("kernel32.dll")] public static extern bool GetSystemTimes(out long idle, out long kernel, out long user);
  [DllImport("kernel32.dll")] public static extern ulong GetTickCount64();
  [DllImport("kernel32.dll")] public static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);
}
[StructLayout(LayoutKind.Sequential)]
public struct MEMORYSTATUSEX {
  public uint dwLength; public uint dwMemoryLoad; public ulong ullTotalPhys; public ulong ullAvailPhys;
  public ulong ullTotalPageFile; public ulong ullAvailPageFile; public ulong ullTotalVirtual; public ulong ullAvailVirtual;
  public ulong ullAvailExtendedVirtual;
}
}
"@

$i1=0; $k1=0; $u1=0; $null = [Neon.Native]::GetSystemTimes([ref]$i1,[ref]$k1,[ref]$u1)
Start-Sleep -Milliseconds 500
$i2=0; $k2=0; $u2=0; $null = [Neon.Native]::GetSystemTimes([ref]$i2,[ref]$k2,[ref]$u2)
$total = ($k2-$k1) + ($u2-$u1)
$cpu = if ($total -gt 0) { [math]::Round((($total - ($i2-$i1)) / $total) * 100) } else { 0 }

$ts = [TimeSpan]::FromMilliseconds([Neon.Native]::GetTickCount64())

$mem = New-Object Neon.MEMORYSTATUSEX
$mem.dwLength = [System.Runtime.InteropServices.Marshal]::SizeOf([type][Neon.MEMORYSTATUSEX])
$null = [Neon.Native]::GlobalMemoryStatusEx([ref]$mem)
$ramPct = if ($mem.ullTotalPhys -gt 0) { [math]::Round(($mem.ullTotalPhys - $mem.ullAvailPhys) / $mem.ullTotalPhys * 100) } else { 0 }

$disk = Get-PSDrive C -ErrorAction SilentlyContinue
$diskPct = if ($disk -and ($disk.Used + $disk.Free) -gt 0) { [math]::Round($disk.Used / ($disk.Used + $disk.Free) * 100) } else { 0 }
$hostname = $env:COMPUTERNAME
$cpuModel = (Get-ItemProperty "HKLM:\HARDWARE\DESCRIPTION\System\CentralProcessor\0" -ErrorAction SilentlyContinue).ProcessorNameString

$temp = "N/A"

Write-Output "== Sistema =="
Write-Output "PC: ${hostname}"
Write-Output "CPU: ${cpuModel}"
Write-Output "Uptime: $([math]::Floor($ts.TotalDays))d $($ts.Hours)h $($ts.Minutes)min"
Write-Output ""
Write-Output "== Hardware =="
Write-Output "CPU: ${cpu}%"
Write-Output "RAM: ${ramPct}%"
Write-Output "Disco: ${diskPct}%"
Write-Output "Temp: ${temp}C"
