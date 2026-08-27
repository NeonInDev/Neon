param(
  [int]$MinAcordado = 50,
  [switch]$SobreQuieto
)
# Acorda o PC e o mantém acordado ate o usuario chegar.
# Chamado pela tarefa agendada NeonAcordar (17:25). O Windows acorda o PC pelo
# WakeToRun; este script garante que ele NAO volte a dormir por idle nos minutos
# seguintes (senao o PC dorme de novo em ~2min e parece que "nunca ligou").

Write-Host "[ACORDAR] $(Get-Date -Format 'HH:mm:ss') - Mantendo o PC acordado por $MinAcordado min..."

# 1) Impede o sleep/hibernate automatico por idle enquanto este processo viver
powercfg /change standby-timeout-ac 0 2>$null
powercfg /change hibernate-timeout-ac 0 2>$null
powercfg /change standby-timeout-dc 0 2>$null
powercfg /change hibernate-timeout-dc 0 2>$null

# 2) Sobe a Neon se nao estiver rodando
$nodeUp = Get-Process node -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $nodeUp) {
  Write-Host "[ACORDAR] Neon nao esta rodando. Iniciando..."
  Start-Process -FilePath "cmd.exe" -ArgumentList '/c','start.bat' -WorkingDirectory "C:\Users\Pichau\neon" -WindowStyle Hidden
} else {
  Write-Host "[ACORDAR] Neon ja esta rodando (PID $($nodeUp.Id))."
}

# 3) Fica vivo mantendo o PC acordado (SetThreadExecutionState) e restaura os
#    timeouts ao final. Reavalia o idle: se o usuario ja chegou (mouse/teclado
#    mexeu), encerra cedo devolvendo o controle.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class AcordarKeeper {
  [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  public static extern uint SetThreadExecutionState(uint esFlags);
  [DllImport("user32.dll")]
  public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public struct LASTINPUTINFO {
    public uint cbSize;
    public uint dwTime;
  }
  public static uint GetLastInputMs() {
    LASTINPUTINFO lii = new LASTINPUTINFO();
    lii.cbSize = (uint)Marshal.SizeOf(lii);
    if (GetLastInputInfo(ref lii)) return lii.dwTime;
    return 0;
  }
}
"@

# ES_CONTINUOUS | ES_SYSTEM_REQUIRED (0x80000001): mantem o PC acordado
$flags = [uint32]::Parse('80000001', 'HexNumber')
[AcordarKeeper]::SetThreadExecutionState($flags) | Out-Null

$inicio = Get-Date
$fim = $inicio.AddMinutes($MinAcordado)

try {
  while ((Get-Date) -lt $fim) {
    # Sinaliza que o sistema precisa continuar acordado
    [AcordarKeeper]::SetThreadExecutionState($flags) | Out-Null

    # Detecta atividade do usuario (ultima entrada). Se nao houver interacao em
    # 20min de idle consecutivo, deixamos dormir de novo (cena: tarefa rodou mas
    # ninguem chegou).
    try {
      $idleMs = [Environment]::TickCount - [AcordarKeeper]::GetLastInputMs()
      if ($idleMs -gt 20 * 60 * 1000) {
        Write-Host "[ACORDAR] 20min sem interacao. Liberando o PC pra dormir de novo."
        break
      }
    } catch {}

    Start-Sleep -Seconds 30
  }
} finally {
  [AcordarKeeper]::SetThreadExecutionState([uint32]::Parse('80000000', 'HexNumber')) | Out-Null
  # Restaura timeouts padrao (30min AC / 15min DC, desligar apos 2h)
  powercfg /change standby-timeout-ac 30 2>$null
  powercfg /change hibernate-timeout-ac 60 2>$null
  powercfg /change standby-timeout-dc 15 2>$null
  powercfg /change hibernate-timeout-dc 30 2>$null
  Write-Host "[ACORDAR] Finalizado. Timeouts restaurados."
}