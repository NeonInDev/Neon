#Requires -Version 5.1
trap { $err = $_.Exception.Message; [Windows.Forms.MessageBox]::Show("Erro: $err", "Neon Installer"); exit 1 }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Win32 API (opcional - fallback se falhar)
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
} catch { Write-Host "[INFO] Win32 API nao disponivel (sombra desativada)" }

$DESTINO     = Join-Path $env:USERPROFILE "Neon"
$LOG_FILE    = Join-Path $env:USERPROFILE "Desktop\neon_install_log.txt"
$PROGRESS_FILE = Join-Path $env:TEMP "neon_install_progress.txt"
$HEADLESS_SCRIPT = Join-Path $PSScriptRoot "Instalador_Neon.ps1"
if (-not (Test-Path $HEADLESS_SCRIPT)) {
  $HEADLESS_SCRIPT = Join-Path (Split-Path $PSScriptRoot -Parent) "installer\Instalador_Neon.ps1"
}

# ── Form ──────────────────────────────────────────────
$form = New-Object System.Windows.Forms.Form
$form.Text = "Neon Installer"
$form.Size = New-Object Drawing.Size(800, 640)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "None"
$form.BackColor = "#0a0a0f"

$icoPath = Join-Path $PSScriptRoot "..\assets\neon.ico"
if (Test-Path $icoPath) {
  try { $form.Icon = [Drawing.Icon]::new($icoPath) } catch {}
}

# Drop shadow on handle created
$form.Add_HandleCreated({
  if ($script:HasWin32) {
    try {
      $hwnd = $form.Handle
      $wsEx = [Win32]::GetWindowLong($hwnd, -20)
      [Win32]::SetWindowLong($hwnd, -20, $wsEx -bor 0x20000)
    } catch {}
  }
})

# ── Custom Title Bar ─────────────────────────────────
$titleBar = New-Object Windows.Forms.Panel
$titleBar.Size = New-Object Drawing.Size(800, 44)
$titleBar.Location = New-Object Drawing.Point(0, 0)
$titleBar.BackColor = "#0d0d1a"
$titleBar.Cursor = "Hand"
$form.Controls.Add($titleBar)

$icoSize = 24
$icoPic = New-Object Windows.Forms.PictureBox
$icoPic.Size = New-Object Drawing.Size($icoSize, $icoSize)
$icoY = [int](($titleBar.Height - $icoSize) / 2)
$icoPic.Location = New-Object Drawing.Point(14, $icoY)
$icoPic.SizeMode = "StretchImage"
if ($form.Icon) { $icoPic.Image = $form.Icon.ToBitmap() }
$titleBar.Controls.Add($icoPic)

$titleLabel = New-Object Windows.Forms.Label
$titleLabel.Text = "  NEON"
$titleLabel.ForeColor = "#00d4ff"
$titleLabel.Font = New-Object Drawing.Font("Segoe UI", 14, [Drawing.FontStyle]::Bold)
$titleLabel.Size = New-Object Drawing.Size(120, 44)
$titleLabel.Location = New-Object Drawing.Point(40, 0)
$titleLabel.TextAlign = "MiddleLeft"
$titleBar.Controls.Add($titleLabel)

$closeBtn = New-Object Windows.Forms.Button
$closeBtn.Text = "X"
$closeBtn.Size = New-Object Drawing.Size(44, 44)
$closeBtn.Location = New-Object Drawing.Point(756, 0)
$closeBtn.FlatStyle = "Flat"
$closeBtn.FlatAppearance.BorderSize = 0
$closeBtn.BackColor = "#1a1a2e"
$closeBtn.ForeColor = "#aaaaaa"
$closeBtn.Font = New-Object Drawing.Font("Segoe UI", 12, [Drawing.FontStyle]::Bold)
$closeBtn.Cursor = "Hand"
$closeBtn.Add_Click({ $form.Close() })
$closeBtn.Add_MouseEnter({ $closeBtn.BackColor = "#ff3333"; $closeBtn.ForeColor = "White" })
$closeBtn.Add_MouseLeave({ $closeBtn.BackColor = "#1a1a2e"; $closeBtn.ForeColor = "#aaaaaa" })
$titleBar.Controls.Add($closeBtn)

# Make title bar draggable
$titleBar.Add_MouseDown({
  param($s, $e)
  if ($e.Button -eq "Left" -and $script:HasWin32) {
    $form.Capture = $false
    try { [Win32]::SendMessage($form.Handle, 0xA1, 0x2, 0) | Out-Null } catch {}
  }
})

# ── Glow Border ─────────────────────────────────────
$glowPanel = New-Object Windows.Forms.Panel
$glowPanel.Size = New-Object Drawing.Size(800, 640)
$glowPanel.Location = New-Object Drawing.Point(0, 0)
$glowPanel.BackColor = "Transparent"
$glowPanel.Add_Paint({
  param($s, $e)
  $g = $e.Graphics
  $pen = New-Object Drawing.Pen([Drawing.Color]::FromArgb(80, 0, 212, 255), 2)
  $g.DrawRectangle($pen, 1, 1, 797, 637)
  $pen.Dispose()
})
$form.Controls.Add($glowPanel)
$glowPanel.SendToBack()

# ── Content ──────────────────────────────────────────
$yOff = 55

$title = New-Object Windows.Forms.Label
$title.Text = "ASSISTENTE PESSOAL NEON"
$title.ForeColor = "#00d4ff"
$title.Font = New-Object Drawing.Font("Segoe UI", 20, [Drawing.FontStyle]::Bold)
$title.Size = New-Object Drawing.Size(760, 44)
$title.Location = New-Object Drawing.Point(30, $yOff)
$form.Controls.Add($title)

$yOff += 44

$subtitle = New-Object Windows.Forms.Label
$subtitle.Text = "Instalação otimizada · Node.js portátil · FFmpeg · Cópia local"
$subtitle.ForeColor = "#606080"
$subtitle.Font = New-Object Drawing.Font("Segoe UI", 10)
$subtitle.Size = New-Object Drawing.Size(760, 20)
$subtitle.Location = New-Object Drawing.Point(32, $yOff)
$form.Controls.Add($subtitle)

$yOff += 28

$accentLine = New-Object Windows.Forms.Label
$accentLine.BorderStyle = "FixedSingle"
$accentLine.Size = New-Object Drawing.Size(740, 1)
$accentLine.Location = New-Object Drawing.Point(30, $yOff)
$accentLine.BackColor = "#00d4ff"
$form.Controls.Add($accentLine)

$yOff += 16

$statusLabel = New-Object Windows.Forms.Label
$statusLabel.Text = "PRONTO PARA INSTALAR"
$statusLabel.ForeColor = "#00d4ff"
$statusLabel.Font = New-Object Drawing.Font("Segoe UI", 11, [Drawing.FontStyle]::Bold)
$statusLabel.Size = New-Object Drawing.Size(740, 22)
$statusLabel.Location = New-Object Drawing.Point(30, $yOff)
$form.Controls.Add($statusLabel)

$yOff += 30

$progressBar = New-Object Windows.Forms.ProgressBar
$progressBar.Size = New-Object Drawing.Size(620, 20)
$progressBar.Location = New-Object Drawing.Point(30, $yOff)
$progressBar.Minimum = 0
$progressBar.Maximum = 100
$progressBar.Value = 0
$progressBar.Style = "Continuous"
$progressBar.ForeColor = "#00d4ff"
$progressBar.BackColor = "#1a1a2e"
$form.Controls.Add($progressBar)

$pctLabel = New-Object Windows.Forms.Label
$pctLabel.Text = "0%"
$pctLabel.ForeColor = "#00d4ff"
$pctLabel.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$pctLabel.Size = New-Object Drawing.Size(50, 20)
$pctLabel.Location = New-Object Drawing.Point(655, $yOff)
$pctLabel.TextAlign = "MiddleLeft"
$form.Controls.Add($pctLabel)

$yOff += 28

$stepLabel = New-Object Windows.Forms.Label
$stepLabel.Text = "AGUARDANDO INÍCIO"
$stepLabel.ForeColor = "#888899"
$stepLabel.Font = New-Object Drawing.Font("Segoe UI", 8, [Drawing.FontStyle]::Bold)
$stepLabel.Size = New-Object Drawing.Size(740, 16)
$stepLabel.Location = New-Object Drawing.Point(30, $yOff)
$form.Controls.Add($stepLabel)

$yOff += 18

$logBox = New-Object Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = "Vertical"
$logBox.Size = New-Object Drawing.Size(740, 310)
$logBox.Location = New-Object Drawing.Point(30, $yOff)
$logBox.BackColor = "#0a0a0f"
$logBox.ForeColor = "#00ff88"
$logBox.Font = New-Object Drawing.Font("Consolas", 9)
$logBox.BorderStyle = "FixedSingle"
$form.Controls.Add($logBox)

$yOff += 318

$installBtn = New-Object Windows.Forms.Button
$installBtn.Text = "▶  INICIAR INSTALAÇÃO"
$installBtn.Size = New-Object Drawing.Size(220, 50)
$installBtn.Location = New-Object Drawing.Point(30, $yOff)
$installBtn.FlatStyle = "Flat"
$installBtn.FlatAppearance.BorderSize = 1
$installBtn.FlatAppearance.BorderColor = "#00d4ff"
$installBtn.FlatAppearance.MouseOverBackColor = "#00d4ff"
$installBtn.FlatAppearance.MouseDownBackColor = "#0099cc"
$installBtn.BackColor = "#0d1a2e"
$installBtn.ForeColor = "#00d4ff"
$installBtn.Font = New-Object Drawing.Font("Segoe UI", 12, [Drawing.FontStyle]::Bold)
$installBtn.Cursor = "Hand"
$installBtn.Add_MouseEnter({ $installBtn.BackColor = "#00d4ff"; $installBtn.ForeColor = "#0a0a0f" })
$installBtn.Add_MouseLeave({ if ($installBtn.Enabled) { $installBtn.BackColor = "#0d1a2e"; $installBtn.ForeColor = "#00d4ff" } })
$form.Controls.Add($installBtn)

$abortBtn = New-Object Windows.Forms.Button
$abortBtn.Text = "CANCELAR"
$abortBtn.Size = New-Object Drawing.Size(120, 50)
$abortBtn.Location = New-Object Drawing.Point(530, $yOff)
$abortBtn.FlatStyle = "Flat"
$abortBtn.FlatAppearance.BorderSize = 1
$abortBtn.FlatAppearance.BorderColor = "#ff8800"
$abortBtn.FlatAppearance.MouseOverBackColor = "#ff8800"
$abortBtn.FlatAppearance.MouseDownBackColor = "#cc6600"
$abortBtn.BackColor = "#1a1a00"
$abortBtn.ForeColor = "#ff8800"
$abortBtn.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$abortBtn.Cursor = "Hand"
$abortBtn.Enabled = $false
$abortBtn.Add_MouseEnter({ if ($abortBtn.Enabled) { $abortBtn.BackColor = "#ff8800"; $abortBtn.ForeColor = "#0a0a0f" } })
$abortBtn.Add_MouseLeave({ if ($abortBtn.Enabled) { $abortBtn.BackColor = "#1a1a00"; $abortBtn.ForeColor = "#ff8800" } })
$form.Controls.Add($abortBtn)

$closeBtn2 = New-Object Windows.Forms.Button
$closeBtn2.Text = "FECHAR"
$closeBtn2.Size = New-Object Drawing.Size(120, 50)
$closeBtn2.Location = New-Object Drawing.Point(655, $yOff)
$closeBtn2.FlatStyle = "Flat"
$closeBtn2.FlatAppearance.BorderSize = 1
$closeBtn2.FlatAppearance.BorderColor = "#ff3333"
$closeBtn2.FlatAppearance.MouseOverBackColor = "#ff3333"
$closeBtn2.FlatAppearance.MouseDownBackColor = "#cc0000"
$closeBtn2.BackColor = "#1a0000"
$closeBtn2.ForeColor = "#ff6666"
$closeBtn2.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$closeBtn2.Cursor = "Hand"
$closeBtn2.Add_MouseEnter({ $closeBtn2.BackColor = "#ff3333"; $closeBtn2.ForeColor = "White" })
$closeBtn2.Add_MouseLeave({ $closeBtn2.BackColor = "#1a0000"; $closeBtn2.ForeColor = "#ff6666" })
$closeBtn2.Add_Click({ $form.Close() })
$form.Controls.Add($closeBtn2)

# ── Functions ─────────────────────────────────────────
function UpdateUI {
  param($status, $pct, $logMsg, $step)
  if ($form.InvokeRequired) {
    $form.Invoke([Action]{ UpdateUI $status $pct $logMsg $step })
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
  if ($step) { $stepLabel.Text = "$step" }
  [System.Windows.Forms.Application]::DoEvents()
}

$script:watchTimer = $null
$job = $null

function StartInstall {
  if (-not (Test-Path $HEADLESS_SCRIPT)) {
    [void][Windows.Forms.MessageBox]::Show("Instalador_Neon.ps1 nao encontrado!", "Erro", "OK", "Exclamation")
    return
  }

  # Stop any previous timer
  if ($script:watchTimer) { $script:watchTimer.Stop(); $script:watchTimer.Dispose(); $script:watchTimer = $null }

  $installBtn.Enabled = $false
  $installBtn.BackColor = "#333344"
  $installBtn.ForeColor = "#666688"
  $abortBtn.Enabled = $true
  $abortBtn.BackColor = "#1a1a00"
  $abortBtn.ForeColor = "#ff8800"
  UpdateUI -status "INSTALANDO..." -pct 0 -logMsg ">>> Iniciando instalacao..." -step "Preparando ambiente"

  $logBox.Clear()
  $script:job = Start-Job -Name "NeonInstall" -ScriptBlock {
    param($scriptPath, $logFile, $progressFile)
    function Write-ProgressHook {
      param($Activity, $Status, $CurrentOperation, $PercentComplete, $Completed)
      $pct = if ($Completed) { 100 } else { [Math]::Max(0, [Math]::Min(100, $PercentComplete)) }
      $ts = Get-Date -Format "HH:mm:ss"
      Add-Content -Path $progressFile -Value "P:$pct"
      if ($CurrentOperation) { Add-Content -Path $progressFile -Value "L:$ts $CurrentOperation" }
      if ($Status) { Add-Content -Path $progressFile -Value "S:$Status" }
    }
    ${function:Write-Progress} = ${function:Write-ProgressHook}
    & $scriptPath -Silent
    Add-Content -Path $progressFile -Value "DONE"
  } -ArgumentList $HEADLESS_SCRIPT, $LOG_FILE, $PROGRESS_FILE

  Set-Content -Path $PROGRESS_FILE -Value "P:0`r`nL:Iniciando..."

  $script:watchTimer = New-Object Windows.Forms.Timer
  $script:watchTimer.Interval = 200

  $tickHandler = {
    if (-not (Test-Path $PROGRESS_FILE)) { return }
    $content = Get-Content -Path $PROGRESS_FILE -Tail 5
    foreach ($line in $content) {
      if ($line -match "^P:(\d+)$") { UpdateUI -pct ([int]$Matches[1]) }
      elseif ($line -match "^L:(.+)$") { UpdateUI -logMsg $Matches[1] }
      elseif ($line -match "^S:(.+)$") { UpdateUI -step $Matches[1] -status "INSTALANDO..." }
      elseif ($line -eq "DONE") {
        $script:watchTimer.Stop()
        UpdateUI -status "INSTALAÇÃO CONCLUÍDA!" -pct 100 -logMsg ">>> INSTALACAO CONCLUIDA!"
        $installBtn.Text = "  CONCLUÍDO"
        $abortBtn.Enabled = $false
        $j = Get-Job -Name "NeonInstall" -ErrorAction SilentlyContinue
        if ($j) { Receive-Job $j -ErrorAction SilentlyContinue | Out-Null; Remove-Job $j -Force -ErrorAction SilentlyContinue }
        Remove-Item -Path $PROGRESS_FILE -Force -ErrorAction SilentlyContinue
      }
    }
    $j = Get-Job -Name "NeonInstall" -ErrorAction SilentlyContinue
    if ($j -and $j.State -eq "Failed") {
      $script:watchTimer.Stop()
      UpdateUI -status "FALHA NA INSTALAÇÃO!" -logMsg ">>> ERRO: Job falhou"
      Receive-Job $j | ForEach-Object { UpdateUI -logMsg "  $_" }
      $installBtn.Enabled = $true
      $installBtn.Text = "▶  TENTAR NOVAMENTE"
      $installBtn.BackColor = "#0d1a2e"
      $installBtn.ForeColor = "#00d4ff"
      $abortBtn.Enabled = $false
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
  UpdateUI -status "INSTALAÇÃO CANCELADA" -pct 0 -logMsg ">>> Cancelado pelo usuario" -step "Cancelado"
  $installBtn.Enabled = $true
  $installBtn.Text = "▶  INSTALAR NEON"
  $installBtn.BackColor = "#0d1a2e"
  $installBtn.ForeColor = "#00d4ff"
  $abortBtn.Enabled = $false
})

$form.Add_Shown({ $form.Activate() })
[void]$form.ShowDialog()
