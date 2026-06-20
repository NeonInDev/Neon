#Requires -Version 5.1
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$DESTINO     = Join-Path $env:USERPROFILE "Neon"
$LOG_FILE    = Join-Path $env:USERPROFILE "Desktop\neon_install_log.txt"
$PROGRESS_FILE = Join-Path $env:TEMP "neon_install_progress.txt"
$HEADLESS_SCRIPT = Join-Path $PSScriptRoot "Instalador_Neon.ps1"
if (-not (Test-Path $HEADLESS_SCRIPT)) {
  $HEADLESS_SCRIPT = Join-Path $PSScriptRoot "installer\Instalador_Neon.ps1"
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Neon Installer v4.0"
$form.Size = New-Object Drawing.Size(760, 620)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox = $false
$form.BackColor = "#0d0d1a"
$form.Icon = $null

$title = New-Object Windows.Forms.Label
$title.Text = "⚡ NEON - Instalacao do Assistente Pessoal"
$title.ForeColor = "#00d4ff"
$title.Font = New-Object Drawing.Font("Segoe UI", 16, [Drawing.FontStyle]::Bold)
$title.Size = New-Object Drawing.Size(720, 40)
$title.Location = New-Object Drawing.Point(20, 15)
$form.Controls.Add($title)

$subtitle = New-Object Windows.Forms.Label
$subtitle.Text = "Node.js portatil + FFmpeg + Copia local do pendrive | v4.0 Otimizado"
$subtitle.ForeColor = "#606080"
$subtitle.Font = New-Object Drawing.Font("Segoe UI", 9)
$subtitle.Size = New-Object Drawing.Size(720, 20)
$subtitle.Location = New-Object Drawing.Point(20, 52)
$form.Controls.Add($subtitle)

$sep1 = New-Object Windows.Forms.Label
$sep1.BorderStyle = "FixedSingle"
$sep1.Size = New-Object Drawing.Size(720, 1)
$sep1.Location = New-Object Drawing.Point(20, 78)
$sep1.BackColor = "#1e1e30"
$form.Controls.Add($sep1)

$statusLabel = New-Object Windows.Forms.Label
$statusLabel.Text = "⏳ Pronto para instalar"
$statusLabel.ForeColor = "#cccccc"
$statusLabel.Font = New-Object Drawing.Font("Segoe UI", 11, [Drawing.FontStyle]::Bold)
$statusLabel.Size = New-Object Drawing.Size(720, 25)
$statusLabel.Location = New-Object Drawing.Point(20, 88)
$form.Controls.Add($statusLabel)

$progressBar = New-Object Windows.Forms.ProgressBar
$progressBar.Size = New-Object Drawing.Size(600, 25)
$progressBar.Location = New-Object Drawing.Point(20, 118)
$progressBar.Minimum = 0
$progressBar.Maximum = 100
$progressBar.Value = 0
$progressBar.Style = "Continuous"
$progressBar.ForeColor = "#00d4ff"
$form.Controls.Add($progressBar)

$pctLabel = New-Object Windows.Forms.Label
$pctLabel.Text = "0%"
$pctLabel.ForeColor = "#00d4ff"
$pctLabel.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$pctLabel.Size = New-Object Drawing.Size(50, 25)
$pctLabel.Location = New-Object Drawing.Point(625, 118)
$pctLabel.TextAlign = "MiddleLeft"
$form.Controls.Add($pctLabel)

$stepLabel = New-Object Windows.Forms.Label
$stepLabel.Text = "Passo: --"
$stepLabel.ForeColor = "#606080"
$stepLabel.Font = New-Object Drawing.Font("Segoe UI", 9)
$stepLabel.Size = New-Object Drawing.Size(720, 18)
$stepLabel.Location = New-Object Drawing.Point(20, 148)
$form.Controls.Add($stepLabel)

$logBox = New-Object Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = "Vertical"
$logBox.Size = New-Object Drawing.Size(720, 350)
$logBox.Location = New-Object Drawing.Point(20, 170)
$logBox.BackColor = "#0a0a0f"
$logBox.ForeColor = "#00ff88"
$logBox.Font = New-Object Drawing.Font("Consolas", 9)
$form.Controls.Add($logBox)

$installBtn = New-Object Windows.Forms.Button
$installBtn.Text = " ▶ Instalar Neon"
$installBtn.Size = New-Object Drawing.Size(180, 50)
$installBtn.Location = New-Object Drawing.Point(20, 535)
$installBtn.BackColor = "#00d4ff"
$installBtn.ForeColor = "#0d0d1a"
$installBtn.Font = New-Object Drawing.Font("Segoe UI", 13, [Drawing.FontStyle]::Bold)
$installBtn.FlatStyle = "Flat"
$installBtn.FlatAppearance.BorderSize = 0
$installBtn.Cursor = "Hand"
$form.Controls.Add($installBtn)

$closeBtn = New-Object Windows.Forms.Button
$closeBtn.Text = "Fechar"
$closeBtn.Size = New-Object Drawing.Size(100, 50)
$closeBtn.Location = New-Object Drawing.Point(640, 535)
$closeBtn.BackColor = "#ff3333"
$closeBtn.ForeColor = "White"
$closeBtn.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$closeBtn.FlatStyle = "Flat"
$closeBtn.FlatAppearance.BorderSize = 0
$closeBtn.Cursor = "Hand"
$closeBtn.Add_Click({ $form.Close() })
$form.Controls.Add($closeBtn)

$abortBtn = New-Object Windows.Forms.Button
$abortBtn.Text = "Cancelar"
$abortBtn.Size = New-Object Drawing.Size(100, 50)
$abortBtn.Location = New-Object Drawing.Point(525, 535)
$abortBtn.BackColor = "#ff8800"
$abortBtn.ForeColor = "White"
$abortBtn.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$abortBtn.FlatStyle = "Flat"
$abortBtn.FlatAppearance.BorderSize = 0
$abortBtn.Cursor = "Hand"
$abortBtn.Enabled = $false
$form.Controls.Add($abortBtn)

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
  if ($step) { $stepLabel.Text = "Passo: $step" }
  [System.Windows.Forms.Application]::DoEvents()
}

$job = $null
$watchTimer = New-Object Windows.Forms.Timer
$watchTimer.Interval = 200

function StartInstall {
  if (-not (Test-Path $HEADLESS_SCRIPT)) {
    [void][Windows.Forms.MessageBox]::Show("Instalador_Neon.ps1 nao encontrado!", "Erro", "OK", "Exclamation")
    return
  }

  $installBtn.Enabled = $false
  $abortBtn.Enabled = $true
  UpdateUI -status "⏳ Instalando..." -pct 0 -logMsg ">>> Iniciando instalacao..." -step "Preparando"

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
    & $scriptPath
    Add-Content -Path $progressFile -Value "DONE"
  } -ArgumentList $HEADLESS_SCRIPT, $LOG_FILE, $PROGRESS_FILE

  Set-Content -Path $PROGRESS_FILE -Value "P:0`r`nL:Iniciando..."

  $watchTimer.Add_Tick({
    if (-not (Test-Path $PROGRESS_FILE)) { return }
    $content = Get-Content -Path $PROGRESS_FILE -Tail 5
    foreach ($line in $content) {
      if ($line -match "^P:(\d+)$") { UpdateUI -pct ([int]$Matches[1]) }
      elseif ($line -match "^L:(.+)$") { UpdateUI -logMsg $Matches[1] }
      elseif ($line -match "^S:(.+)$") { UpdateUI -step $Matches[1] -status "⏳ $($Matches[1])" }
      elseif ($line -eq "DONE") {
        $watchTimer.Stop()
        UpdateUI -status "✅ Instalacao concluida!" -pct 100 -logMsg ">>> INSTALACAO CONCLUIDA!"
        $installBtn.Text = " Concluido"
        $abortBtn.Enabled = $false
        $j = Get-Job -Name "NeonInstall" -ErrorAction SilentlyContinue
        if ($j) { Remove-Job $j -Force -ErrorAction SilentlyContinue }
        Remove-Item -Path $PROGRESS_FILE -Force -ErrorAction SilentlyContinue
      }
    }
    $j = Get-Job -Name "NeonInstall" -ErrorAction SilentlyContinue
    if ($j -and $j.State -eq "Failed") {
      $watchTimer.Stop()
      UpdateUI -status "❌ Instalacao falhou!" -logMsg ">>> ERRO: Job falhou"
      Receive-Job $j | ForEach-Object { UpdateUI -logMsg "  $_" }
      $installBtn.Enabled = $true
      $installBtn.Text = " Tentar novamente"
      $abortBtn.Enabled = $false
      Remove-Job $j -Force -ErrorAction SilentlyContinue
    }
  })

  $watchTimer.Start()
}

$installBtn.Add_Click({ StartInstall })

$abortBtn.Add_Click({
  $j = Get-Job -Name "NeonInstall" -ErrorAction SilentlyContinue
  if ($j) { Stop-Job $j; Remove-Job $j -Force -ErrorAction SilentlyContinue }
  $watchTimer.Stop()
  UpdateUI -status "⛔ Instalacao cancelada" -pct 0 -logMsg ">>> Cancelado pelo usuario" -step "Cancelado"
  $installBtn.Enabled = $true
  $installBtn.Text = " ▶ Instalar Neon"
  $abortBtn.Enabled = $false
})

$form.Add_Shown({ $form.Activate() })
[void]$form.ShowDialog()
