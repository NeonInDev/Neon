# Vigilante de RAM da Neon
# Se a RAM livre cair abaixo do limite, mostra uma notificacao que aparece por cima de jogos em tela cheia
# e desliga a Neon de forma suave (via /api/shutdown, que salva dados e encerra sem dor).
param(
  [int]$MinMB = 900,
  [int]$CheckSec = 10
)
$ErrorActionPreference = "SilentlyContinue"
$Neon = "C:\Users\Pichau\Neon"

function Ler-Chave {
  $envArq = Get-Content (Join-Path $Neon ".env") -Raw
  if ($envArq -match '(?m)^\s*MASTER_KEY\s*=\s*(.+?)\s*$') { return $Matches[1].Trim() }
  return $null
}

function Notificar-Topo([string]$titulo, [string]$mensagem) {
  # AVISO: esta funcao ja TIROU O FOCO DO DONO DO JOGO. Duas vezes, por motivos
  # diferentes, e os dois precisam estar registrados aqui.
  #
  # 1) A versao original desenhava um Windows.Forms.Form NORMAL com
  #    TopMost = $true e ShowDialog(). No Windows, ShowDialog + TopMost faz o
  #    sistema ATIVAR a janela ao mostrar. Ou seja, a notificacao de RAM
  #    tirava o jogador da partida. E aparecia "do nada" porque o gatilho e
  #    RAM, nao comando: bastava o Valorant derrubar a memoria livre abaixo de
  #    900 MB. Confirmado no log: [15:49:07] livre=838 MB -> RAM CRITICA ->
  #    Notificar-Topo, exatamente 2 minutos antes do dono relatar.
  #
  # 2) A versao seguinte tentou corrigir com um form em C#, mas continuava
  #    chamando "powershell -Command $script" num processo FILHO. Ai o
  #    Windows come as aspas duplas do C# na passagem por linha de comando:
  #        new Font("Segoe UI", 13, ...)  ->  new Font(Segoe UI, 13, ...)
  #    O C# nao compilava e, como o watchdog roda com
  #    ErrorActionPreference=SilentlyContinue, a falha era 100% silenciosa: a
  #    notificacao nunca mais aparecia e ninguem percebia.
  #
  # A CORRECAO DE VERDADE: NAO HA PROCESSO FILHO. O proprio watchdog ja roda
  # oculto (lancado pelo NeonVigilanteRAM.vbs com WScript.Shell.Run 0), entao
  # ele desenha o form sem invocar powershell nenhum. Some de cena o
  # powershell.exe do System32, que era a janela fantasma que o dono viu
  # aparecendo. E sem passar por argv, nao ha aspa para o Windows comer.
  #
  # O form e NeonToast: WS_EX_NOACTIVATE + WS_EX_TOOLWINDOW +
  # ShowWithoutActivation. Aparece por cima, some em 10s, e nao toca no foco,
  # nao entra no Alt+Tab e nao aparece na barra de tarefas.
  if (-not ("NeonToast" -as [type])) {
    try {
      # -ReferencedAssemblies e obrigatorio: sem isso o compilador C# nao ve
      # System.Windows.Forms e a classe nao compila.
      Add-Type -ReferencedAssemblies 'System.Windows.Forms','System.Drawing' -ErrorAction Stop -TypeDefinition @'
using System;
using System.Drawing;
using System.Windows.Forms;

public class NeonToast : Form
{
    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= 0x08000000; // WS_EX_NOACTIVATE: nunca recebe foco
            cp.ExStyle |= 0x00040000; // WS_EX_TOOLWINDOW: fora do Alt+Tab
            return cp;
        }
    }

    public NeonToast(string titulo, string mensagem)
    {
        this.FormBorderStyle = FormBorderStyle.None;
        this.BackColor = Color.FromArgb(30, 30, 40);
        this.Size = new Size(440, 140);
        this.StartPosition = FormStartPosition.Manual;
        Rectangle area = Screen.PrimaryScreen.WorkingArea;
        this.Location = new Point(area.Right - 440 - 16, area.Bottom - 140 - 16);
        this.TopMost = true;

        Label l1 = new Label();
        l1.Text = titulo;
        l1.Font = new Font("Segoe UI", 13, FontStyle.Bold);
        l1.ForeColor = Color.Orange;
        l1.Location = new Point(16, 14);
        l1.AutoSize = true;

        Label l2 = new Label();
        l2.Text = mensagem;
        l2.Font = new Font("Segoe UI", 11);
        l2.ForeColor = Color.White;
        l2.Location = new Point(16, 48);
        l2.AutoSize = true;
        l2.MaximumSize = new Size(400, 80);

        this.Controls.Add(l1);
        this.Controls.Add(l2);
    }

    public static void Mostrar(string titulo, string mensagem)
    {
        NeonToast t = new NeonToast(titulo, mensagem);
        t.Shown += delegate
        {
            Timer tm = new Timer();
            tm.Interval = 10000;
            tm.Tick += delegate { tm.Stop(); Application.ExitThread(); };
            tm.Start();
        };
        Application.Run(t);
    }
}
'@
    } catch {
      # antes isso era invisivel; agora vira log
      try {
        Add-Content -LiteralPath $logFile ("[{0}] FALHA ao compilar o NeonToast: {1}" -f (Get-Date -Format "HH:mm:ss"), $_.Exception.Message)
      } catch { }
    }
  }
  [NeonToast]::Mostrar($titulo, $mensagem)
}

$chave = Ler-Chave
$logDir = Join-Path $Neon "logs"
if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$pidFile = Join-Path $logDir "vigilante_ram.pid"
$logFile = Join-Path $logDir "vigilante_ram.log"

if (Test-Path -LiteralPath $pidFile) {
  $antigo = (Get-Content -LiteralPath $pidFile -Raw).Trim()
  if ($antigo -and (Get-Process -Id $antigo -ErrorAction SilentlyContinue)) {
    Write-Output "[vigilante] Ja existe um vigilante rodando (PID $antigo). Saindo."
    exit 0
  }
}
Set-Content -LiteralPath $pidFile "$PID"
Add-Content -LiteralPath $logFile ("[{0}] vigilante iniciado PID $PID (limite {1} MB, check {2}s)" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $MinMB, $CheckSec)
Write-Output ("[vigilante] Observando RAM livre (limite $MinMB MB, check $CheckSec s). Chave: " + $(if ($chave) { "ok" } else { "FALTANDO" }))

# Le a RAM disponivel. O Get-Counter depende do servico de contadores de
# desempenho e neste PC ele falha, devolvendo $null. Antes o codigo fazia
# "if (-not $ctr) { continue }" e o loop passava reto, em silencio: o log nunca
# ganhava uma linha "livre=" e a protecao de RAM ficava INERTE, sem nunca
# avisar nem desligar. Agora ha um plano B sem Get-Counter e sem Get-CimInstance
# (que esta proibido neste PC), e a falha vira log em vez de sumir.
Add-Type -AssemblyName Microsoft.VisualBasic -ErrorAction SilentlyContinue

function Get-RamLivreMB {
  $ctr = Get-Counter '\Memory\Available MBytes' -ErrorAction SilentlyContinue
  if ($ctr -and $ctr.CounterSamples.Count -gt 0) {
    return [math]::Round($ctr.CounterSamples[0].CookedValue)
  }
  # plano B: .NET, sem contadores de desempenho e sem WMI
  try {
    $info = New-Object Microsoft.VisualBasic.Devices.ComputerInfo
    return [math]::Round($info.AvailablePhysicalMemory / 1MB)
  } catch { return $null }
}

$falhasLeitura = 0
while ($true) {
  Start-Sleep -Seconds $CheckSec
  $freeMB = Get-RamLivreMB
  if ($null -eq $freeMB) {
    $falhasLeitura++
    Add-Content -LiteralPath $logFile ("[{0}] NAO CONSEGUIU LER A RAM (tentativa {1})" -f (Get-Date -Format "HH:mm:ss"), $falhasLeitura)
    continue
  }
  if ($falhasLeitura -gt 0) {
    Add-Content -LiteralPath $logFile ("[{0}] leitura de RAM normalizada: {1} MB" -f (Get-Date -Format "HH:mm:ss"), $freeMB)
    $falhasLeitura = 0
  }
  Add-Content -LiteralPath $logFile ("[{0}] livre={1} MB" -f (Get-Date -Format "HH:mm:ss"), $freeMB)

  if ($freeMB -lt $MinMB) {
    Write-Output ("[vigilante] RAM critica: $freeMB MB livres. Desligando Neon suavemente.")
    Add-Content -LiteralPath $logFile ("[{0}] RAM CRITICA ({1} MB) - desligando Neon suavemente" -f (Get-Date -Format "HH:mm:ss"), $freeMB)
    Notificar-Topo "Neon desligada - RAM no limite" "Sobraram $freeMB MB de RAM. Desliguei a Neon sem dor para o seu jogo nao travar, chefe."
    if ($chave) {
      # A API da Neon NAO escuta em 127.0.0.1. Ela sobe em API_HOST, que no
      # .env e o IP do Tailscale (100.115.96.52). O codigo pedia sempre
      # 127.0.0.1:3000, entao a conexao falhava com "Impossivel conectar-se ao
      # servidor remoto" e o desligamento suave NUNCA acontecia: sobrava sempre
      # o kill forcado do processo. Agora tenta os dois enderecos.
      $apiOk = $false
      foreach ($host_ in @("127.0.0.1", "localhost")) {
        try {
          Invoke-RestMethod -Uri "http://${host_}:3000/api/shutdown" -Method Post -Headers @{ "x-hud-key" = $chave } -TimeoutSec 4 | Out-Null
          Add-Content -LiteralPath $logFile ("[{0}] pedido de desligamento suave enviado para {1}:3000" -f (Get-Date -Format "HH:mm:ss"), $host_)
          $apiOk = $true
          break
        } catch { }
      }
      # o IP do Tailscale vem do proprio .env, sem hardcode
      if (-not $apiOk) {
        try {
          $envTxt = [System.IO.File]::ReadAllText((Join-Path $Neon ".env"))
          if ($envTxt -match '(?m)^\s*API_HOST\s*=\s*([0-9\.]+)\s*$') {
            $apiHost = $Matches[1].Trim()
            Invoke-RestMethod -Uri "http://${apiHost}:3000/api/shutdown" -Method Post -Headers @{ "x-hud-key" = $chave } -TimeoutSec 4 | Out-Null
            Add-Content -LiteralPath $logFile ("[{0}] pedido de desligamento suave enviado para {1}:3000 (API_HOST do .env)" -f (Get-Date -Format "HH:mm:ss"), $apiHost)
            $apiOk = $true
          }
        } catch {
          Add-Content -LiteralPath $logFile ("[{0}] API nao respondeu: {1}" -f (Get-Date -Format "HH:mm:ss"), $_.Exception.Message)
        }
      }
      if (-not $apiOk -and -not (Select-String -LiteralPath $logFile -Pattern "API nao respondeu" -Quiet)) {
        Add-Content -LiteralPath $logFile ("[{0}] API nao respondeu em nenhum endereco; caindo para o encerramento direto" -f (Get-Date -Format "HH:mm:ss"))
      }
    }
    Start-Sleep -Seconds 8
    # ANTES: Get-Process -Name node | Stop-Process -Force
    # Isso matava TODO processo node do PC, nao so a Neon. Como o dono usa
    # opencode (que e node) e tem outros projetos node, um pico de RAM durante
    # o jogo derrubava tudo junto, sem avisar. Pior: se a API nao respondeu,
    # esse era o unico metodo de desligamento e ele era tambem o mais
    # destrutivo.
    # AGORA: derruba so o processo que responde na porta 3000, que e a Neon.
    # netstat nao usa WMI (Get-CimInstance e proibido neste PC).
    $neonPid = $null
    try {
      $linha = netstat -ano -p TCP | Select-String ':3000\s' | Select-String 'LISTENING' | Select-Object -First 1
      if ($linha) {
        $partes = ($linha -replace '\s+', ' ').Trim().Split(' ')
        $neonPid = [int]$partes[-1]
      }
    } catch { }
    if ($neonPid) {
      Add-Content -LiteralPath $logFile ("[{0}] encerrando SO o processo da Neon na porta 3000 (PID {1})" -f (Get-Date -Format "HH:mm:ss"), $neonPid)
      Stop-Process -Id $neonPid -Force -ErrorAction SilentlyContinue
    } else {
      # Sem PID confiavel: NAO derrubar nada. E melhor o bot sobreviver
      # consumindo memoria do que matar processos do dono as cegas.
      Add-Content -LiteralPath $logFile ("[{0}] nao achei PID da porta 3000; NAO encerrei nada para nao derrubar outros processos" -f (Get-Date -Format "HH:mm:ss"))
    }
    break
  }
}
Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
