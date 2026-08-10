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
  $script = @"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
\$f = New-Object Windows.Forms.Form
\$f.TopMost = \$true
\$f.ShowInTaskbar = \$false
\$f.FormBorderStyle = [Windows.Forms.FormBorderStyle]::None
\$f.BackColor = [System.Drawing.Color]::FromArgb(30,30,40)
\$f.Width = 440
\$f.Height = 140
\$f.StartPosition = [Windows.Forms.FormStartPosition]::Manual
\$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
\$f.Left = \$area.Right - \$f.Width - 16
\$f.Top = \$area.Bottom - \$f.Height - 16
\$l1 = New-Object Windows.Forms.Label
\$l1.Text = '$titulo'
\$l1.Font = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)
\$l1.ForeColor = [System.Drawing.Color]::Orange
\$l1.Location = New-Object System.Drawing.Point(16, 14)
\$l1.AutoSize = \$true
\$l2 = New-Object Windows.Forms.Label
\$l2.Text = '$mensagem'
\$l2.Font = New-Object System.Drawing.Font('Segoe UI', 11)
\$l2.ForeColor = [System.Drawing.Color]::White
\$l2.Location = New-Object System.Drawing.Point(16, 48)
\$l2.AutoSize = \$true
\$l2.MaximumSize = New-Object System.Drawing.Size(400, 80)
\$f.Controls.Add(\$l1)
\$f.Controls.Add(\$l2)
\$t = New-Object Windows.Forms.Timer
\$t.Interval = 10000
\$t.add_Tick({ \$f.Close() })
\$t.Start()
[void]\$f.ShowDialog()
"@
  & powershell -NoProfile -ExecutionPolicy Bypass -Command $script
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

while ($true) {
  Start-Sleep -Seconds $CheckSec
  $ctr = Get-Counter '\Memory\Available MBytes' -ErrorAction SilentlyContinue
  if (-not $ctr) { continue }
  $freeMB = [math]::Round($ctr.CounterSamples[0].CookedValue)
  Add-Content -LiteralPath $logFile ("[{0}] livre={1} MB" -f (Get-Date -Format "HH:mm:ss"), $freeMB)

  if ($freeMB -lt $MinMB) {
    Write-Output ("[vigilante] RAM critica: $freeMB MB livres. Desligando Neon suavemente.")
    Add-Content -LiteralPath $logFile ("[{0}] RAM CRITICA ({1} MB) - desligando Neon suavemente" -f (Get-Date -Format "HH:mm:ss"), $freeMB)
    Notificar-Topo "Neon desligada - RAM no limite" "Sobraram $freeMB MB de RAM. Desliguei a Neon sem dor para o seu jogo nao travar, chefe."
    if ($chave) {
      try {
        Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/shutdown" -Method Post -Headers @{ "x-hud-key" = $chave } -TimeoutSec 6 | Out-Null
        Add-Content -LiteralPath $logFile ("[{0}] pedido de desligamento suave enviado" -f (Get-Date -Format "HH:mm:ss"))
      } catch {
        Add-Content -LiteralPath $logFile ("[{0}] API nao respondeu: {1}" -f (Get-Date -Format "HH:mm:ss"), $_.Exception.Message)
      }
    }
    Start-Sleep -Seconds 8
    Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    break
  }
}
Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
