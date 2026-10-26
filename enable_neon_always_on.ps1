$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$startBot = Join-Path $root "start_neon.ps1"
$startWake = Join-Path $root "start_neon_wake.ps1"
$logon = New-ScheduledTaskTrigger -AtLogOn -User $identity
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

$botAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startBot`""
$wakeAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startWake`""
Register-ScheduledTask -TaskName "Neon Always On - Bot" -Action $botAction -Trigger @($logon, $repeat) -Principal $principal -Settings $settings -Description "Mantém o bot Neon iniciado e recupera o serviço se ele parar." -Force | Out-Null
Register-ScheduledTask -TaskName "Neon Always On - Wake Word" -Action $wakeAction -Trigger @($logon, $repeat) -Principal $principal -Settings $settings -Description "Mantém ativo o ouvinte local da frase Neon deploy." -Force | Out-Null

Write-Output "Inicialização automática configurada para o logon atual. O bot é conferido a cada 2 minutos e o ouvinte do microfone permanece ativo na sessão do usuário."
