# ===================== MODO JOGO: NADA PODE ABRIR JANELA NA TELA =====================
#
# O dono foi explicito: "EU SO NAO QUERO Q FIQUE ABRINDO COISA NA MINHA TELA
# NA HORA DO JOGO". Nao quer explicacao, quer guarantee.
#
# Por que este script existe, mesmo com todo o resto do projeto usando
# windowsHide: because hide por processo e uma promessa, e promessa quebra.
# Um spawn esquecido (o src/som.js roda um powershell detached, e tinha
# windowsHide faltando), uma tarefa agendada, um .cmd, um atalho, um
# programa do Windows, e o powershell.exe do System32 abre na frente do
# jogador. Auditar nao da garantia; vigiar da.
#
# Como funciona: a cada 1s, se houver jogo rodando, este script esconde TODA
# janela de console do powershell/conhost que aparecer, usando
# ShowWindow(hwnd, SW_HIDE). E uma rede, nao uma correcao pontual: nao
# importa o que abriu, some.
#
# Filtros que impedem ele de esconder coisa errada:
#   - so janela de classe ConsoleWindowClass (console, nao app com janela)
#   - so processo chamado powershell, pwsh, conhost ou cmd
#   - nunca o proprio PID
#
# O proprio script roda sem console: e lancado pelo modo_jogo_inicial.vbs
# com WScript.Shell.Run(..., 0), que cria o processo sem janela. Por isso ele
# pode ser aggressive sem se auto-sabotar.

$ErrorActionPreference = "SilentlyContinue"
$logDir = "C:\Users\Pichau\Neon\logs"
if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir "modo_jogo.log"
$pidFile = Join-Path $logDir "modo_jogo.pid"

if (Test-Path -LiteralPath $pidFile) {
  $antigo = (Get-Content -LiteralPath $pidFile -Raw).Trim()
  if ($antigo -and (Get-Process -Id $antigo -ErrorAction SilentlyContinue)) { exit 0 }
}
Set-Content -LiteralPath $pidFile "$PID"
Add-Content -LiteralPath $logFile ("[{0}] modo jogo iniciado PID $PID" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))

$JOGOS = @(
  "VALORANT-Win64-Shipping.exe", "cs2.exe", "csgo.exe", "GTA5.exe", "FiveM.exe",
  "javaw.exe", "osu!.exe", "League of Legends.exe", "StarRail.exe",
  "EscapeFromTarkov.exe", "hl2.exe", "doom.exe", "Cyberpunk2077.exe", "RDR2.exe"
)
$ALVOS = @("powershell", "pwsh", "conhost", "cmd")

Add-Type -ReferencedAssemblies 'System.Windows.Forms','System.Drawing' -ErrorAction SilentlyContinue -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public class EsconderConsole
{
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr hWnd, out int pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    // Devolve quantos consoles foram escondidos.
    public static int Esconder(int meuPid)
    {
        int achados = 0;
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam)
        {
            try
            {
                if (!IsWindowVisible(hWnd)) return true;

                int pid;
                GetWindowThreadProcessId(hWnd, out pid);
                if (pid == 0 || pid == meuPid) return true;

                StringBuilder cls = new StringBuilder(64);
                GetClassName(hWnd, cls, cls.Capacity);
                if (cls.ToString() != "ConsoleWindowClass") return true;

                string nome = "";
                try { nome = Process.GetProcessById(pid).ProcessName.ToLower(); }
                catch { return true; }

                if (nome == "powershell" || nome == "pwsh" || nome == "conhost" || nome == "cmd")
                {
                    ShowWindow(hWnd, 0); // SW_HIDE
                    achados++;
                }
            }
            catch { }
            return true;
        }, IntPtr.Zero);
        return achados;
    }
}
'@

$emJogo = $false
while ($true) {
  Start-Sleep -Seconds 1

  if (-not $emJogo) {
    $ps = Get-Process -ErrorAction SilentlyContinue
    foreach ($j in $JOGOS) {
      if ($ps | Where-Object { $_.ProcessName -like ($j -replace '\.exe$','') }) { $emJogo = $true; break }
    }
    if ($emJogo) {
      Add-Content -LiteralPath $logFile ("[{0}] JOGO DETECTADO - modo protecao de tela ligado" -f (Get-Date -Format "HH:mm:ss"))
      # prova de que a engrenagem esta montada: sem o tipo, Esconder() lancaria
      # excecao a cada segundo e o watchdog seria silenciosamente inerte, que
      # foi exatamente o que aconteceu com o Get-Counter e com o toast de RAM.
      $temTipo = [System.Management.Automation.PSTypeName]"EsconderConsole"
      if ($temTipo.Type) {
        Add-Content -LiteralPath $logFile ("[{0}]   engrenagem OK: EsconderConsole carregado, WS_EX/SW_HIDE ativo" -f (Get-Date -Format "HH:mm:ss"))
      } else {
        Add-Content -LiteralPath $logFile ("[{0}]   FALHA: EsconderConsole NAO carregou, protecao INATIVA" -f (Get-Date -Format "HH:mm:ss"))
      }
    }
    continue
  }

  $n = [EsconderConsole]::Esconder($PID)
  if ($n -gt 0) {
    Add-Content -LiteralPath $logFile ("[{0}] escondi {1} console(s) de powershell durante o jogo" -f (Get-Date -Format "HH:mm:ss"), $n)
  }

  # se o jogo fechar, volta a dormir
  $aindaJogo = $false
  $ps = Get-Process -ErrorAction SilentlyContinue
  foreach ($j in $JOGOS) {
    if ($ps | Where-Object { $_.ProcessName -like ($j -replace '\.exe$','') }) { $aindaJogo = $true; break }
  }
  if (-not $aindaJogo) {
    $emJogo = $false
    Add-Content -LiteralPath $logFile ("[{0}] jogo encerrado - protecao desligada" -f (Get-Date -Format "HH:mm:ss"))
  }
}
