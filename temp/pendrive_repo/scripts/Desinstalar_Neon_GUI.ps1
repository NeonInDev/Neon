#Requires -Version 5.1
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$HEADLESS_SCRIPT = Join-Path $PSScriptRoot "Desinstalar_Neon.ps1"
if (-not (Test-Path $HEADLESS_SCRIPT)) {
  $HEADLESS_SCRIPT = Join-Path (Split-Path $PSScriptRoot -Parent) "installer\Desinstalar_Neon.ps1"
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Neon Uninstaller v2.0"
$form.Size = New-Object Drawing.Size(660, 520)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox = $false
$form.BackColor = "#0d0d1a"

$title = New-Object Windows.Forms.Label
$title.Text = "🗑 NEON - Desinstalar"
$title.ForeColor = "#ff4444"
$title.Font = New-Object Drawing.Font("Segoe UI", 18, [Drawing.FontStyle]::Bold)
$title.Size = New-Object Drawing.Size(620, 45)
$title.Location = New-Object Drawing.Point(20, 15)
$form.Controls.Add($title)

$subtitle = New-Object Windows.Forms.Label
$subtitle.Text = "Remove projetos, atalhos, perfis Chrome e FFmpeg"
$subtitle.ForeColor = "#606080"
$subtitle.Font = New-Object Drawing.Font("Segoe UI", 9)
$subtitle.Size = New-Object Drawing.Size(620, 20)
$subtitle.Location = New-Object Drawing.Point(20, 55)
$form.Controls.Add($subtitle)

$sep1 = New-Object Windows.Forms.Label
$sep1.BorderStyle = "FixedSingle"
$sep1.Size = New-Object Drawing.Size(620, 1)
$sep1.Location = New-Object Drawing.Point(20, 80)
$sep1.BackColor = "#1e1e30"
$form.Controls.Add($sep1)

$infoBox = New-Object Windows.Forms.TextBox
$infoBox.Multiline = $true
$infoBox.ReadOnly = $true
$infoBox.BackColor = "#0a0a0f"
$infoBox.ForeColor = "#ff8888"
$infoBox.Font = New-Object Drawing.Font("Consolas", 9)
$infoBox.Size = New-Object Drawing.Size(620, 120)
$infoBox.Location = New-Object Drawing.Point(20, 88)
$infoBox.Text = @"
Isso vai remover:
  - Pasta do projeto (C:\Users\$env:USERNAME\Neon)
  - Atalhos da area de trabalho
  - Perfis Chrome (WhatsApp, Voz)
  - FFmpeg (C:\ffmpeg)
"@
$form.Controls.Add($infoBox)

$logBox = New-Object Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = "Vertical"
$logBox.Size = New-Object Drawing.Size(620, 180)
$logBox.Location = New-Object Drawing.Point(20, 215)
$logBox.BackColor = "#0a0a0f"
$logBox.ForeColor = "#00ff88"
$logBox.Font = New-Object Drawing.Font("Consolas", 9)
$form.Controls.Add($logBox)

$progressBar = New-Object Windows.Forms.ProgressBar
$progressBar.Size = New-Object Drawing.Size(420, 25)
$progressBar.Location = New-Object Drawing.Point(20, 410)
$progressBar.Minimum = 0
$progressBar.Maximum = 100
$progressBar.Value = 0
$progressBar.Style = "Continuous"
$progressBar.ForeColor = "#ff4444"
$form.Controls.Add($progressBar)

$pctLabel = New-Object Windows.Forms.Label
$pctLabel.Text = "0%"
$pctLabel.ForeColor = "#ff4444"
$pctLabel.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$pctLabel.Size = New-Object Drawing.Size(50, 25)
$pctLabel.Location = New-Object Drawing.Point(445, 410)
$pctLabel.TextAlign = "MiddleLeft"
$form.Controls.Add($pctLabel)

$uninstallBtn = New-Object Windows.Forms.Button
$uninstallBtn.Text = " Desinstalar"
$uninstallBtn.Size = New-Object Drawing.Size(180, 50)
$uninstallBtn.Location = New-Object Drawing.Point(20, 445)
$uninstallBtn.BackColor = "#ff4444"
$uninstallBtn.ForeColor = "White"
$uninstallBtn.Font = New-Object Drawing.Font("Segoe UI", 13, [Drawing.FontStyle]::Bold)
$uninstallBtn.FlatStyle = "Flat"
$uninstallBtn.FlatAppearance.BorderSize = 0
$uninstallBtn.Cursor = "Hand"
$form.Controls.Add($uninstallBtn)

$closeBtn = New-Object Windows.Forms.Button
$closeBtn.Text = "Fechar"
$closeBtn.Size = New-Object Drawing.Size(100, 50)
$closeBtn.Location = New-Object Drawing.Point(540, 445)
$closeBtn.BackColor = "#333355"
$closeBtn.ForeColor = "White"
$closeBtn.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$closeBtn.FlatStyle = "Flat"
$closeBtn.FlatAppearance.BorderSize = 0
$closeBtn.Cursor = "Hand"
$closeBtn.Add_Click({ $form.Close() })
$form.Controls.Add($closeBtn)

function UpdateUI {
  param($logMsg, $pct)
  if ($form.InvokeRequired) { $form.Invoke([Action]{ UpdateUI $logMsg $pct }); return }
  if ($logMsg) { $logBox.AppendText("${logMsg}`r`n"); $logBox.SelectionStart = $logBox.Text.Length; $logBox.ScrollToCaret() }
  if ($pct -ge 0 -and $pct -le 100) { $progressBar.Value = $pct; $pctLabel.Text = "${pct}%" }
  [System.Windows.Forms.Application]::DoEvents()
}

$PROGRESS_FILE = Join-Path $env:TEMP "neon_uninstall_progress.txt"

function StartUninstall {
  if (-not (Test-Path $HEADLESS_SCRIPT)) {
    [void][Windows.Forms.MessageBox]::Show("Desinstalar_Neon.ps1 nao encontrado!", "Erro", "OK", "Exclamation")
    return
  }

  $uninstallBtn.Enabled = $false
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

  $watchTimer = New-Object Windows.Forms.Timer
  $watchTimer.Interval = 200

  $watchTimer.Add_Tick({
    if (-not (Test-Path $PROGRESS_FILE)) { return }
    $content = Get-Content -Path $PROGRESS_FILE -Tail 5
    $done = $false
    foreach ($line in $content) {
      if ($line -match "^P:(\d+)$") { UpdateUI -pct ([int]$Matches[1]) }
      elseif ($line -match "^L:(.+)$") { UpdateUI -logMsg $Matches[1] }
      elseif ($line -eq "DONE" -or $line -like "*sucesso*") { $done = $true }
    }

    $j = Get-Job -Name "NeonUninstall" -ErrorAction SilentlyContinue
    if ($done -or ($j -and $j.State -ne "Running")) {
      $watchTimer.Stop()
      $j = Get-Job -Name "NeonUninstall" -ErrorAction SilentlyContinue
      if ($j) {
        Receive-Job $j | ForEach-Object { UpdateUI -logMsg "  $_" }
        Remove-Job $j -Force -ErrorAction SilentlyContinue
      }
      UpdateUI -logMsg ">>> Desinstalacao concluida!" -pct 100
      $uninstallBtn.Text = " Concluido"
      Remove-Item -Path $PROGRESS_FILE -Force -ErrorAction SilentlyContinue
    }
  })

  $watchTimer.Start()
}

$uninstallBtn.Add_Click({ StartUninstall })

$form.Add_Shown({ $form.Activate() })
[void]$form.ShowDialog()
