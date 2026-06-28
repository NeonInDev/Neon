#Requires -Version 5.1
trap { $err = $_.Exception.Message; [Windows.Forms.MessageBox]::Show("Erro: $err", "Neon Installer"); exit 1 }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:HasWin32 = $false
try {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")] public static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);
}
"@ -ErrorAction Stop
  $script:HasWin32 = $true
} catch {}

$DESTINO     = Join-Path $env:USERPROFILE "Neon"
$LOG_FILE    = Join-Path $env:USERPROFILE "Desktop\neon_install_log.txt"
$PROGRESS_FILE = Join-Path $env:TEMP "neon_install_progress.txt"
$HEADLESS_SCRIPT = Join-Path $PSScriptRoot "Instalador_Neon.ps1"

$stepNames = @(
  "Verificando pendrive",
  "Preparando destino",
  "Copiando projeto",
  "Instalando Node.js",
  "Instalando dependencias",
  "Configurando FFmpeg",
  "Configurando ambiente",
  "Criando atalhos"
)

$stepLabels = @()

# ── Colors ──
$cBg       = "#0a0a0f"
$cTitleBar = "#0d0d1a"
$cAccent   = "#00d4ff"
$cAccent2  = "#00ff88"
$cText     = "#cccccc"
$cDim      = "#606080"
$cStepDone = "#00d4ff"
$cStepCur  = "#00ff88"
$cStepWait = "#333344"
$cBtnBg    = "#0d1a2e"

# ── Form ──
$form = New-Object System.Windows.Forms.Form
$form.Text = "Neon Installer v5.0"
$form.Size = New-Object Drawing.Size(820, 700)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "None"
$form.BackColor = $cBg

$icoPath = Join-Path $PSScriptRoot "..\assets\neon.ico"
if (Test-Path $icoPath) {
  try { $form.Icon = [Drawing.Icon]::new($icoPath) } catch {}
}

$form.Add_HandleCreated({
  if ($script:HasWin32) {
    try {
      $hwnd = $form.Handle
      $wsEx = [Win32]::GetWindowLong($hwnd, -20)
      [Win32]::SetWindowLong($hwnd, -20, $wsEx -bor 0x20000)
    } catch {}
  }
})

# ── Custom Title Bar ──
$titleBar = New-Object Windows.Forms.Panel
$titleBar.Size = New-Object Drawing.Size(820, 48)
$titleBar.Location = New-Object Drawing.Point(0, 0)
$titleBar.BackColor = $cTitleBar
$titleBar.Cursor = "Hand"
$form.Controls.Add($titleBar)

$icoSize = 28
$icoPic = New-Object Windows.Forms.PictureBox
$icoPic.Size = New-Object Drawing.Size($icoSize, $icoSize)
$icoPic.Location = New-Object Drawing.Point(16, 10)
$icoPic.SizeMode = "StretchImage"
if ($form.Icon) { $icoPic.Image = $form.Icon.ToBitmap() }
$titleBar.Controls.Add($icoPic)

$titleLabel = New-Object Windows.Forms.Label
$titleLabel.Text = "  NEON v5.0"
$titleLabel.ForeColor = $cAccent
$titleLabel.Font = New-Object Drawing.Font("Segoe UI", 14, [Drawing.FontStyle]::Bold)
$titleLabel.Size = New-Object Drawing.Size(150, 48)
$titleLabel.Location = New-Object Drawing.Point(44, 0)
$titleLabel.TextAlign = "MiddleLeft"
$titleBar.Controls.Add($titleLabel)

$closeBtn = New-Object Windows.Forms.Button
$closeBtn.Text = "X"
$closeBtn.Size = New-Object Drawing.Size(48, 48)
$closeBtn.Location = New-Object Drawing.Point(772, 0)
$closeBtn.FlatStyle = "Flat"
$closeBtn.FlatAppearance.BorderSize = 0
$closeBtn.BackColor = $cTitleBar
$closeBtn.ForeColor = "#aaaaaa"
$closeBtn.Font = New-Object Drawing.Font("Segoe UI", 14, [Drawing.FontStyle]::Bold)
$closeBtn.Cursor = "Hand"
$closeBtn.Add_Click({ $form.Close() })
$closeBtn.Add_MouseEnter({ $closeBtn.BackColor = "#ff3333"; $closeBtn.ForeColor = "White" })
$closeBtn.Add_MouseLeave({ $closeBtn.BackColor = $cTitleBar; $closeBtn.ForeColor = "#aaaaaa" })
$titleBar.Controls.Add($closeBtn)

$titleBar.Add_MouseDown({
  param($s, $e)
  if ($e.Button -eq "Left" -and $script:HasWin32) {
    $form.Capture = $false
    try { [Win32]::SendMessage($form.Handle, 0xA1, 0x2, 0) | Out-Null } catch {}
  }
})

# ── Glow Border ──
$glowPanel = New-Object Windows.Forms.Panel
$glowPanel.Size = New-Object Drawing.Size(820, 700)
$glowPanel.Location = New-Object Drawing.Point(0, 0)
$glowPanel.BackColor = "Transparent"
$glowPanel.Add_Paint({
  param($s, $e)
  $g = $e.Graphics
  $pen = New-Object Drawing.Pen([Drawing.Color]::FromArgb(80, 0, 212, 255), 2)
  $g.DrawRectangle($pen, 1, 1, 817, 697)
  $pen.Dispose()
})
$form.Controls.Add($glowPanel)
$glowPanel.SendToBack()

# ── Header ──
$headerLabel = New-Object Windows.Forms.Label
$headerLabel.Text = "ASSISTENTE PESSOAL NEON"
$headerLabel.ForeColor = $cAccent
$headerLabel.Font = New-Object Drawing.Font("Segoe UI", 18, [Drawing.FontStyle]::Bold)
$headerLabel.Size = New-Object Drawing.Size(500, 40)
$headerLabel.Location = New-Object Drawing.Point(30, 58)
$form.Controls.Add($headerLabel)

$subtitle = New-Object Windows.Forms.Label
$subtitle.Text = "Node.js portátil · FFmpeg · Cópia local · Registro de PC"
$subtitle.ForeColor = $cDim
$subtitle.Font = New-Object Drawing.Font("Segoe UI", 10)
$subtitle.Size = New-Object Drawing.Size(500, 20)
$subtitle.Location = New-Object Drawing.Point(32, 96)
$form.Controls.Add($subtitle)

# ── Top divider ──
$divider = New-Object Windows.Forms.Label
$divider.BorderStyle = "FixedSingle"
$divider.Size = New-Object Drawing.Size(760, 1)
$divider.Location = New-Object Drawing.Point(30, 122)
$divider.BackColor = $cAccent
$form.Controls.Add($divider)

# ── Left: Step List ──
$stepPanel = New-Object Windows.Forms.Panel
$stepPanel.Size = New-Object Drawing.Size(280, 340)
$stepPanel.Location = New-Object Drawing.Point(30, 136)
$stepPanel.BackColor = $cBg
$form.Controls.Add($stepPanel)

function New-StepLabel {
  param($text, $top)
  $lbl = New-Object Windows.Forms.Label
  $lbl.Text = "  ⬤  $text"
  $lbl.ForeColor = $cStepWait
  $lbl.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Regular)
  $lbl.Size = New-Object Drawing.Size(260, 28)
  $lbl.Location = New-Object Drawing.Point(0, $top)
  $lbl.Padding = New-Object Drawing.Padding(6, 4, 0, 0)
  $lbl.BackColor = $cBg
  return $lbl
}

for ($i = 0; $i -lt $stepNames.Count; $i++) {
  $lbl = New-StepLabel -text $stepNames[$i] -top ($i * 34)
  $stepPanel.Controls.Add($lbl)
  $stepLabels += $lbl
}

# ── Right: Status + Log ──
$rightPanel = New-Object Windows.Forms.Panel
$rightPanel.Size = New-Object Drawing.Size(470, 340)
$rightPanel.Location = New-Object Drawing.Point(320, 136)
$rightPanel.BackColor = $cBg
$form.Controls.Add($rightPanel)

$statusLabel = New-Object Windows.Forms.Label
$statusLabel.Text = "PRONTO PARA INSTALAR"
$statusLabel.ForeColor = $cAccent
$statusLabel.Font = New-Object Drawing.Font("Segoe UI", 12, [Drawing.FontStyle]::Bold)
$statusLabel.Size = New-Object Drawing.Size(460, 24)
$statusLabel.Location = New-Object Drawing.Point(0, 0)
$rightPanel.Controls.Add($statusLabel)

$progressBar = New-Object Windows.Forms.ProgressBar
$progressBar.Size = New-Object Drawing.Size(400, 22)
$progressBar.Location = New-Object Drawing.Point(0, 30)
$progressBar.Minimum = 0
$progressBar.Maximum = 100
$progressBar.Value = 0
$progressBar.Style = "Continuous"
$progressBar.ForeColor = $cAccent
$progressBar.BackColor = "#1a1a2e"
$rightPanel.Controls.Add($progressBar)

$pctLabel = New-Object Windows.Forms.Label
$pctLabel.Text = "0%"
$pctLabel.ForeColor = $cAccent
$pctLabel.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$pctLabel.Size = New-Object Drawing.Size(50, 22)
$pctLabel.Location = New-Object Drawing.Point(405, 30)
$pctLabel.TextAlign = "MiddleLeft"
$rightPanel.Controls.Add($pctLabel)

$detailLabel = New-Object Windows.Forms.Label
$detailLabel.Text = ""
$detailLabel.ForeColor = "#888899"
$detailLabel.Font = New-Object Drawing.Font("Segoe UI", 8, [Drawing.FontStyle]::Bold)
$detailLabel.Size = New-Object Drawing.Size(460, 16)
$detailLabel.Location = New-Object Drawing.Point(0, 56)
$rightPanel.Controls.Add($detailLabel)

$logBox = New-Object Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = "Vertical"
$logBox.Size = New-Object Drawing.Size(460, 240)
$logBox.Location = New-Object Drawing.Point(0, 78)
$logBox.BackColor = $cBg
$logBox.ForeColor = $cAccent2
$logBox.Font = New-Object Drawing.Font("Consolas", 9)
$logBox.BorderStyle = "FixedSingle"
$rightPanel.Controls.Add($logBox)

# ── Bottom divider + Buttons ──
$divider2 = New-Object Windows.Forms.Label
$divider2.BorderStyle = "FixedSingle"
$divider2.Size = New-Object Drawing.Size(760, 1)
$divider2.Location = New-Object Drawing.Point(30, 490)
$divider2.BackColor = $cAccent
$form.Controls.Add($divider2)

function MakeButton {
  param($text, $x, $y, $w, $h, $borderColor, $hoverColor, $textColor, $hoverTextColor)
  $btn = New-Object Windows.Forms.Button
  $btn.Text = $text
  $btn.Size = New-Object Drawing.Size($w, $h)
  $btn.Location = New-Object Drawing.Point($x, $y)
  $btn.FlatStyle = "Flat"
  $btn.FlatAppearance.BorderSize = 1
  $btn.FlatAppearance.BorderColor = $borderColor
  $btn.FlatAppearance.MouseOverBackColor = $hoverColor
  $btn.FlatAppearance.MouseDownBackColor = $hoverColor
  $btn.BackColor = $cBtnBg
  $btn.ForeColor = $borderColor
  $btn.Font = New-Object Drawing.Font("Segoe UI", 11, [Drawing.FontStyle]::Bold)
  $btn.Cursor = "Hand"
  $btn.Add_MouseEnter({ $btn.BackColor = $hoverColor; $btn.ForeColor = $hoverTextColor })
  $btn.Add_MouseLeave({ if ($btn.Enabled) { $btn.BackColor = $cBtnBg; $btn.ForeColor = $borderColor } })
  return $btn
}

$installBtn = MakeButton -text "▶  INICIAR INSTALAÇÃO" -x 30 -y 505 -w 240 -h 52 -borderColor $cAccent -hoverColor $cAccent -textColor $cAccent -hoverTextColor "#0a0a0f"
$form.Controls.Add($installBtn)

$abortBtn = MakeButton -text "CANCELAR" -x 530 -y 505 -w 120 -h 52 -borderColor "#ff8800" -hoverColor "#ff8800" -textColor "#ff8800" -hoverTextColor "#0a0a0f"
$abortBtn.Enabled = $false
$form.Controls.Add($abortBtn)

$closeBtn2 = MakeButton -text "FECHAR" -x 660 -y 505 -w 130 -h 52 -borderColor "#ff3333" -hoverColor "#ff3333" -textColor "#ff6666" -hoverTextColor "White"
$closeBtn2.Add_Click({ $form.Close() })
$form.Controls.Add($closeBtn2)

# ── Status bar ──
$statusBar = New-Object Windows.Forms.Label
$statusBar.BorderStyle = "FixedSingle"
$statusBar.Size = New-Object Drawing.Size(760, 28)
$statusBar.Location = New-Object Drawing.Point(30, 570)
$statusBar.BackColor = $cBg
$statusBar.ForeColor = $cDim
$statusBar.Font = New-Object Drawing.Font("Segoe UI", 8)
$statusBar.TextAlign = "MiddleLeft"
$statusBar.Text = "  Pronto | Neon v5.0 | Instala offline"
$form.Controls.Add($statusBar)

# ── Functions ──
function ResetStepLabels {
  for ($i = 0; $i -lt $stepLabels.Count; $i++) {
    $stepLabels[$i].Text = "  ⬤  $($stepNames[$i])"
    $stepLabels[$i].ForeColor = $cStepWait
    $stepLabels[$i].Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Regular)
  }
}

function SetStepState {
  param([int]$current, [string]$detail)
  ResetStepLabels
  for ($i = 0; $i -lt $stepLabels.Count; $i++) {
    if ($i -lt $current) {
      $stepLabels[$i].Text = "  ✔  $($stepNames[$i])"
      $stepLabels[$i].ForeColor = $cStepDone
    } elseif ($i -eq $current) {
      $stepLabels[$i].Text = "  ▶  $($stepNames[$i])"
      $stepLabels[$i].ForeColor = $cStepCur
      $stepLabels[$i].Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
    }
  }
  if ($detail) {
    $detailLabel.Text = $detail
  }
}

function UpdateUI {
  param($status, $pct, $logMsg, $step, $detail)
  if ($form.InvokeRequired) {
    $form.Invoke([Action]{ UpdateUI $status $pct $logMsg $step $detail })
    return
  }
  if ($status) { $statusLabel.Text = $status }
  if ($pct -ge 0 -and $pct -le 100) {
    $progressBar.Value = $pct
    $pctLabel.Text = "${pct}%"
  }
  if ($logMsg) {
    $ts = Get-Date -Format "HH:mm:ss"
    $logBox.AppendText("[${ts}] ${logMsg}`r`n")
    $logBox.SelectionStart = $logBox.Text.Length
    $logBox.ScrollToCaret()
  }
  if ($step -ge 0 -and $step -lt $stepNames.Count) {
    SetStepState -current $step -detail $detail
  } elseif ($detail) {
    $detailLabel.Text = $detail
  }
  [System.Windows.Forms.Application]::DoEvents()
}

$script:watchTimer = $null
$job = $null

function StartInstall {
  if (-not (Test-Path $HEADLESS_SCRIPT)) {
    [void][Windows.Forms.MessageBox]::Show("Instalador_Neon.ps1 nao encontrado!", "Erro", "OK", "Exclamation")
    return
  }

  if ($script:watchTimer) { $script:watchTimer.Stop(); $script:watchTimer.Dispose(); $script:watchTimer = $null }

  $installBtn.Enabled = $false
  $installBtn.BackColor = "#333344"
  $installBtn.ForeColor = "#666688"
  $abortBtn.Enabled = $true
  $abortBtn.BackColor = "#1a1a00"
  $abortBtn.ForeColor = "#ff8800"
  $statusBar.Text = "  Instalando... | PC: $env:COMPUTERNAME"
  ResetStepLabels
  $logBox.Clear()
  UpdateUI -status "INSTALANDO..." -pct 0 -step 0 -detail $stepNames[0] -logMsg ">>> Iniciando instalacao..."

  Remove-Item -Path $PROGRESS_FILE -Force -ErrorAction SilentlyContinue

  $script:job = Start-Job -Name "NeonInstall" -ScriptBlock {
    param($scriptPath, $progressFile)
    $env:NEON_INSTALL_PROGRESS = $progressFile
    function Write-ProgressHook {
      param($Activity, $Status, $CurrentOperation, $PercentComplete, $Completed)
      $pct = if ($Completed) { 100 } else { [Math]::Max(0, [Math]::Min(100, $PercentComplete)) }
      $ts = Get-Date -Format "HH:mm:ss"
      Add-Content -Path $progressFile -Value "P:$pct"
      if ($CurrentOperation) { Add-Content -Path $progressFile -Value "L:$ts $CurrentOperation" }
      if ($Status) { Add-Content -Path $progressFile -Value "S:$Status" }
      if ($Activity) { Add-Content -Path $progressFile -Value "A:$Activity" }
    }
    ${function:Write-Progress} = ${function:Write-ProgressHook}
    & $scriptPath -Silent
    Add-Content -Path $progressFile -Value "DONE"
  } -ArgumentList $HEADLESS_SCRIPT, $PROGRESS_FILE

  $script:watchTimer = New-Object Windows.Forms.Timer
  $script:watchTimer.Interval = 200

  $tickHandler = {
    if (-not (Test-Path $PROGRESS_FILE)) { return }
    $content = Get-Content -Path $PROGRESS_FILE -Tail 10
    $currentStep = -1
    foreach ($line in $content) {
      if ($line -match "^STEP:(\d+)$") { $currentStep = [int]$Matches[1] - 1 }
      elseif ($line -match "^NAME:(.+)$") { $stepName = $Matches[1] }
      elseif ($line -match "^P:(\d+)$") { UpdateUI -pct ([int]$Matches[1]) }
      elseif ($line -match "^DETAIL:(.+)$") { UpdateUI -detail $Matches[1] }
      elseif ($line -match "^L:(.+)$") { UpdateUI -logMsg $Matches[1] }
      elseif ($line -match "^S:(.+)$") { UpdateUI -status $Matches[1] }
      elseif ($line -match "^ERROR:(.+)$") { UpdateUI -logMsg ">>> ERRO: $($Matches[1])" }
      elseif ($line -eq "DONE") {
        $script:watchTimer.Stop()
        UpdateUI -status "INSTALAÇÃO CONCLUÍDA!" -pct 100 -logMsg ">>> INSTALACAO CONCLUIDA!" -step ($stepNames.Count)
        $installBtn.Text = "  CONCLUÍDO"
        $abortBtn.Enabled = $false
        $statusBar.Text = "  Concluido | Neon v5.0 | Reinicie o bot apos configurar o .env"
        $j = Get-Job -Name "NeonInstall" -ErrorAction SilentlyContinue
        if ($j) { Receive-Job $j -ErrorAction SilentlyContinue | Out-Null; Remove-Job $j -Force -ErrorAction SilentlyContinue }
        Remove-Item -Path $PROGRESS_FILE -Force -ErrorAction SilentlyContinue
      }
    }
    if ($currentStep -ge 0) {
      SetStepState -current $currentStep -detail $stepName
    }
    $j = Get-Job -Name "NeonInstall" -ErrorAction SilentlyContinue
    if ($j -and $j.State -eq "Failed") {
      $script:watchTimer.Stop()
      $errMsg = Receive-Job $j -ErrorAction SilentlyContinue | Out-String
      UpdateUI -status "FALHA NA INSTALAÇÃO!" -logMsg ">>> ERRO: $errMsg"
      $installBtn.Enabled = $true
      $installBtn.Text = "▶  TENTAR NOVAMENTE"
      $installBtn.BackColor = $cBtnBg
      $installBtn.ForeColor = $cAccent
      $abortBtn.Enabled = $false
      $statusBar.Text = "  Erro na instalacao | Verifique o log acima"
      Remove-Job $j -Force -ErrorAction SilentlyContinue
    }
  }

  $script:watchTimer.Add_Tick($tickHandler)
  $script:watchTimer.Start()
}

$installBtn.Add_Click({ StartInstall })

$abortBtn.Add_Click({
  $j = Get-Job -Name "NeonInstall" -ErrorAction SilentlyContinue
  if ($j) { Stop-Job $j; Remove-Job $j -Force -ErrorAction SilentlyContinue }
  if ($script:watchTimer) { $script:watchTimer.Stop(); $script:watchTimer.Dispose(); $script:watchTimer = $null }
  ResetStepLabels
  UpdateUI -status "INSTALAÇÃO CANCELADA" -pct 0 -logMsg ">>> Cancelado pelo usuario"
  $installBtn.Enabled = $true
  $installBtn.Text = "▶  INSTALAR NEON"
  $installBtn.BackColor = $cBtnBg
  $installBtn.ForeColor = $cAccent
  $abortBtn.Enabled = $false
  $statusBar.Text = "  Cancelado | Neon v5.0"
  Remove-Item -Path $PROGRESS_FILE -Force -ErrorAction SilentlyContinue
})

$form.Add_Shown({ $form.Activate() })
[void]$form.ShowDialog()
