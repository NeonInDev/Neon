#Requires -Version 5.1
trap { $err = $_.Exception.Message; [Windows.Forms.MessageBox]::Show("Erro: $err", "Neon Uninstaller"); exit 1 }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:HasWin32 = $false
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")] public static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);
}
'@ -ErrorAction Stop
  $script:HasWin32 = $true
} catch { Write-Host "[INFO] Win32 API nao disponivel (sombra desativada)" }

$HEADLESS_SCRIPT = Join-Path $PSScriptRoot "Desinstalar_Neon.ps1"
if (-not (Test-Path $HEADLESS_SCRIPT)) {
  $HEADLESS_SCRIPT = Join-Path (Split-Path $PSScriptRoot -Parent) "installer\Desinstalar_Neon.ps1"
}

# ── Form ──────────────────────────────────────────────
$form = New-Object System.Windows.Forms.Form
$form.Text = "Neon Uninstaller"
$form.Size = New-Object Drawing.Size(700, 560)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "None"
$form.BackColor = "#0a0a0f"

$icoPath = Join-Path $PSScriptRoot "..\assets\neon.ico"
if (Test-Path $icoPath) { try { $form.Icon = [Drawing.Icon]::new($icoPath) } catch {} }

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
$titleBar.Size = New-Object Drawing.Size(700, 44)
$titleBar.Location = New-Object Drawing.Point(0, 0)
$titleBar.BackColor = "#0d0d1a"
$titleBar.Cursor = "Hand"
$form.Controls.Add($titleBar)

$icoSize = 24
$icoY = [int](($titleBar.Height - $icoSize) / 2)
$icoPic = New-Object Windows.Forms.PictureBox
$icoPic.Size = New-Object Drawing.Size($icoSize, $icoSize)
$icoPic.Location = New-Object Drawing.Point(14, $icoY)
$icoPic.SizeMode = "StretchImage"
if ($form.Icon) { $icoPic.Image = $form.Icon.ToBitmap() }
$titleBar.Controls.Add($icoPic)

$titleLabel = New-Object Windows.Forms.Label
$titleLabel.Text = "  NEON"
$titleLabel.ForeColor = "#ff4444"
$titleLabel.Font = New-Object Drawing.Font("Segoe UI", 14, [Drawing.FontStyle]::Bold)
$titleLabel.Size = New-Object Drawing.Size(120, 44)
$titleLabel.Location = New-Object Drawing.Point(40, 0)
$titleLabel.TextAlign = "MiddleLeft"
$titleBar.Controls.Add($titleLabel)

$closeBtn = New-Object Windows.Forms.Button
$closeBtn.Text = "X"
$closeBtn.Size = New-Object Drawing.Size(44, 44)
$closeBtn.Location = New-Object Drawing.Point(656, 0)
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

$titleBar.Add_MouseDown({
  param($s, $e)
  if ($e.Button -eq "Left" -and $script:HasWin32) {
    $form.Capture = $false
    try { [Win32]::SendMessage($form.Handle, 0xA1, 0x2, 0) | Out-Null } catch {}
  }
})

# ── Glow Border ─────────────────────────────────────
$glowPanel = New-Object Windows.Forms.Panel
$glowPanel.Size = New-Object Drawing.Size(700, 560)
$glowPanel.Location = New-Object Drawing.Point(0, 0)
$glowPanel.BackColor = "Transparent"
$glowPanel.Add_Paint({
  param($s, $e)
  $g = $e.Graphics
  $pen = New-Object Drawing.Pen([Drawing.Color]::FromArgb(80, 255, 68, 68), 2)
  $g.DrawRectangle($pen, 1, 1, 697, 557)
  $pen.Dispose()
})
$form.Controls.Add($glowPanel)
$glowPanel.SendToBack()

# ── Content ──────────────────────────────────────────
$yOff = 55

$titleLbl = New-Object Windows.Forms.Label
$titleLbl.Text = "DESINSTALAR NEON"
$titleLbl.ForeColor = "#ff4444"
$titleLbl.Font = New-Object Drawing.Font("Segoe UI", 18, [Drawing.FontStyle]::Bold)
$titleLbl.Size = New-Object Drawing.Size(660, 40)
$titleLbl.Location = New-Object Drawing.Point(20, $yOff)
$form.Controls.Add($titleLbl)

$yOff += 38

$subtitleLbl = New-Object Windows.Forms.Label
$subtitleLbl.Text = "Remove projeto, atalhos, perfis Chrome e FFmpeg"
$subtitleLbl.ForeColor = "#606080"
$subtitleLbl.Font = New-Object Drawing.Font("Segoe UI", 9)
$subtitleLbl.Size = New-Object Drawing.Size(660, 20)
$subtitleLbl.Location = New-Object Drawing.Point(22, $yOff)
$form.Controls.Add($subtitleLbl)

$yOff += 28

$accentLine = New-Object Windows.Forms.Label
$accentLine.BorderStyle = "FixedSingle"
$accentLine.Size = New-Object Drawing.Size(660, 1)
$accentLine.Location = New-Object Drawing.Point(20, $yOff)
$accentLine.BackColor = "#ff4444"
$form.Controls.Add($accentLine)

$yOff += 12

$infoBox = New-Object Windows.Forms.TextBox
$infoBox.Multiline = $true
$infoBox.ReadOnly = $true
$infoBox.BackColor = "#0a0a0f"
$infoBox.ForeColor = "#ff8888"
$infoBox.Font = New-Object Drawing.Font("Consolas", 9)
$infoBox.BorderStyle = "FixedSingle"
$infoBox.Size = New-Object Drawing.Size(660, 90)
$infoBox.Location = New-Object Drawing.Point(20, $yOff)
$infoBox.Text = "Isso vai remover:`r`n  - Pasta do projeto ($env:USERPROFILE\Neon)`r`n  - Atalhos da area de trabalho`r`n  - Perfis Chrome (WhatsApp, Voz)`r`n  - FFmpeg (C:\ffmpeg)"
$form.Controls.Add($infoBox)

$yOff += 100

$logBox = New-Object Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = "Vertical"
$logBox.Size = New-Object Drawing.Size(660, 180)
$logBox.Location = New-Object Drawing.Point(20, $yOff)
$logBox.BackColor = "#0a0a0f"
$logBox.ForeColor = "#00ff88"
$logBox.Font = New-Object Drawing.Font("Consolas", 9)
$logBox.BorderStyle = "FixedSingle"
$form.Controls.Add($logBox)

$yOff += 190

$progressBar = New-Object Windows.Forms.ProgressBar
$progressBar.Size = New-Object Drawing.Size(450, 22)
$progressBar.Location = New-Object Drawing.Point(20, $yOff)
$progressBar.Minimum = 0
$progressBar.Maximum = 100
$progressBar.Value = 0
$progressBar.Style = "Continuous"
$progressBar.ForeColor = "#ff4444"
$progressBar.BackColor = "#2a1a1a"
$form.Controls.Add($progressBar)

$pctLabel = New-Object Windows.Forms.Label
$pctLabel.Text = "0%"
$pctLabel.ForeColor = "#ff4444"
$pctLabel.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$pctLabel.Size = New-Object Drawing.Size(50, 22)
$pctLabel.Location = New-Object Drawing.Point(475, $yOff)
$pctLabel.TextAlign = "MiddleLeft"
$form.Controls.Add($pctLabel)

$yOff += 35

$uninstallBtn = New-Object Windows.Forms.Button
$uninstallBtn.Text = "🗑  DESINSTALAR"
$uninstallBtn.Size = New-Object Drawing.Size(200, 52)
$uninstallBtn.Location = New-Object Drawing.Point(20, $yOff)
$uninstallBtn.FlatStyle = "Flat"
$uninstallBtn.FlatAppearance.BorderSize = 1
$uninstallBtn.FlatAppearance.BorderColor = "#ff4444"
$uninstallBtn.FlatAppearance.MouseOverBackColor = "#ff4444"
$uninstallBtn.BackColor = "#1a0000"
$uninstallBtn.ForeColor = "#ff4444"
$uninstallBtn.Font = New-Object Drawing.Font("Segoe UI", 12, [Drawing.FontStyle]::Bold)
$uninstallBtn.Cursor = "Hand"
$uninstallBtn.Add_MouseEnter({ $uninstallBtn.BackColor = "#ff4444"; $uninstallBtn.ForeColor = "White" })
$uninstallBtn.Add_MouseLeave({ if ($uninstallBtn.Enabled) { $uninstallBtn.BackColor = "#1a0000"; $uninstallBtn.ForeColor = "#ff4444" } })
$form.Controls.Add($uninstallBtn)

$closeBtn2 = New-Object Windows.Forms.Button
$closeBtn2.Text = "FECHAR"
$closeBtn2.Size = New-Object Drawing.Size(100, 52)
$closeBtn2.Location = New-Object Drawing.Point(580, $yOff)
$closeBtn2.FlatStyle = "Flat"
$closeBtn2.FlatAppearance.BorderSize = 1
$closeBtn2.FlatAppearance.BorderColor = "#ff3333"
$closeBtn2.FlatAppearance.MouseOverBackColor = "#ff3333"
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
  param($logMsg, $pct)
  if ($form.InvokeRequired) { $form.Invoke([System.Action]{ UpdateUI $logMsg $pct }); return }
  if ($logMsg) { $logBox.AppendText("${logMsg}`r`n"); $logBox.SelectionStart = $logBox.Text.Length; $logBox.ScrollToCaret() }
  if ($pct -ge 0 -and $pct -le 100) { $progressBar.Value = $pct; $pctLabel.Text = "${pct}%" }
  [System.Windows.Forms.Application]::DoEvents()
}

$PROGRESS_FILE = Join-Path $env:TEMP "neon_uninstall_progress.txt"
$script:watchTimer = $null

function StartUninstall {
  if (-not (Test-Path $HEADLESS_SCRIPT)) {
    [void][Windows.Forms.MessageBox]::Show("Desinstalar_Neon.ps1 nao encontrado!", "Erro", "OK", "Exclamation")
    return
  }

  if ($script:watchTimer) { $script:watchTimer.Stop(); $script:watchTimer.Dispose(); $script:watchTimer = $null }

  $uninstallBtn.Enabled = $false
  $uninstallBtn.BackColor = "#333344"
  $uninstallBtn.ForeColor = "#666688"
  $logBox.Clear()
  UpdateUI -logMsg ">>> Iniciando desinstalacao..." -pct 0

  Set-Content -Path $PROGRESS_FILE -Value "P:0`r`nL:Iniciando..."

  $job = Start-Job -Name "NeonUninstall" -ScriptBlock {
    param($scriptPath, $progressFile)
    function Write-ProgressHook {
      param($Activity, $Status, $CurrentOperation, $PercentComplete, $Completed)
      $pct = if ($Completed) { 100 } else { [Math]::Max(0, [Math]::Min(100, $PercentComplete)) }
      $ts = Get-Date -Format "HH:mm:ss"
      Add-Content -Path $progressFile -Value "P:$pct"
      if ($CurrentOperation) { Add-Content -Path $progressFile -Value "L:$ts $CurrentOperation" }
    }
    ${function:Write-Progress} = ${function:Write-ProgressHook}
    & $scriptPath -Silent
    Add-Content -Path $progressFile -Value "DONE"
  } -ArgumentList $HEADLESS_SCRIPT, $PROGRESS_FILE

  $script:watchTimer = New-Object Windows.Forms.Timer
  $script:watchTimer.Interval = 200

  $tickHandler = {
    if (-not (Test-Path $PROGRESS_FILE)) { return }
    $content = Get-Content -Path $PROGRESS_FILE -Tail 5
    foreach ($line in $content) {
      if ($line -match "^P:(\d+)$") { UpdateUI -pct ([int]$Matches[1]) }
      elseif ($line -match "^L:(.+)$") { UpdateUI -logMsg $Matches[1] }
      elseif ($line -eq "DONE") {
        $script:watchTimer.Stop()
        $j = Get-Job -Name "NeonUninstall" -ErrorAction SilentlyContinue
        if ($j) { Receive-Job $j -ErrorAction SilentlyContinue | ForEach-Object { UpdateUI -logMsg "  $_" }; Remove-Job $j -Force }
        UpdateUI -logMsg ">>> Desinstalacao concluida!" -pct 100
        $uninstallBtn.Text = "  CONCLUÍDO"
        Remove-Item -Path $PROGRESS_FILE -Force -ErrorAction SilentlyContinue
      }
    }
    $j = Get-Job -Name "NeonUninstall" -ErrorAction SilentlyContinue
    if ($j -and $j.State -eq "Failed") {
      $script:watchTimer.Stop()
      UpdateUI -logMsg ">>> ERRO: Job falhou"
      Receive-Job $j | ForEach-Object { UpdateUI -logMsg "  $_" }
      $uninstallBtn.Enabled = $true
      $uninstallBtn.Text = "🗑  TENTAR NOVAMENTE"
      $uninstallBtn.BackColor = "#1a0000"
      $uninstallBtn.ForeColor = "#ff4444"
      Remove-Job $j -Force -ErrorAction SilentlyContinue
    }
  }

  $script:watchTimer.Add_Tick($tickHandler)
  $script:watchTimer.Start()
}

$uninstallBtn.Add_Click({ StartUninstall })

$form.Add_Shown({ $form.Activate() })
[void]$form.ShowDialog()
