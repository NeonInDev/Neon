#Requires -Version 5.1
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$DESTINO     = Join-Path $env:USERPROFILE "Neon"
$LOG_FILE    = Join-Path $env:USERPROFILE "Desktop\neon_install_log.txt"
$PROGRESS_FILE = Join-Path $env:TEMP "neon_install_progress.txt"
$HEADLESS_SCRIPT = Join-Path $PSScriptRoot "Instalador_Neon.ps1"
if (-not (Test-Path $HEADLESS_SCRIPT)) {
  $HEADLESS_SCRIPT = Join-Path (Split-Path $PSScriptRoot -Parent) "installer\Instalador_Neon.ps1"
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Neon Installer v3.2"
$form.Size = New-Object Drawing.Size(720, 560)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox = $false
$form.BackColor = "#1a1a2e"

$title = New-Object Windows.Forms.Label
$title.Text = "NEON - Instalacao do Assistente Pessoal"
$title.ForeColor = "#00d4ff"
$title.Font = New-Object Drawing.Font("Segoe UI", 14, [Drawing.FontStyle]::Bold)
$title.Size = New-Object Drawing.Size(680, 35)
$title.Location = New-Object Drawing.Point(20, 15)
$form.Controls.Add($title)

$subtitle = New-Object Windows.Forms.Label
$subtitle.Text = "Tudo que precisa pra rodar a Neon: Node.js, Git, FFmpeg, dependencias"
$subtitle.ForeColor = "#888899"
$subtitle.Font = New-Object Drawing.Font("Segoe UI", 9)
$subtitle.Size = New-Object Drawing.Size(680, 20)
$subtitle.Location = New-Object Drawing.Point(20, 48)
$form.Controls.Add($subtitle)

$statusLabel = New-Object Windows.Forms.Label
$statusLabel.Text = "Pronto para instalar"
$statusLabel.ForeColor = "#cccccc"
$statusLabel.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$statusLabel.Size = New-Object Drawing.Size(680, 22)
$statusLabel.Location = New-Object Drawing.Point(20, 75)
$form.Controls.Add($statusLabel)

$progressBar = New-Object Windows.Forms.ProgressBar
$progressBar.Size = New-Object Drawing.Size(680, 28)
$progressBar.Location = New-Object Drawing.Point(20, 100)
$progressBar.Minimum = 0
$progressBar.Maximum = 100
$progressBar.Value = 0
$progressBar.Style = "Continuous"
$progressBar.ForeColor = "#00d4ff"
$form.Controls.Add($progressBar)

$logBox = New-Object Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = "Vertical"
$logBox.Size = New-Object Drawing.Size(680, 310)
$logBox.Location = New-Object Drawing.Point(20, 140)
$logBox.BackColor = "#0d0d1a"
$logBox.ForeColor = "#00ff88"
$logBox.Font = New-Object Drawing.Font("Consolas", 9)
$form.Controls.Add($logBox)

$installBtn = New-Object Windows.Forms.Button
$installBtn.Text = " Instalar Neon"
$installBtn.Size = New-Object Drawing.Size(180, 45)
$installBtn.Location = New-Object Drawing.Point(20, 465)
$installBtn.BackColor = "#00d4ff"
$installBtn.ForeColor = "#1a1a2e"
$installBtn.Font = New-Object Drawing.Font("Segoe UI", 12, [Drawing.FontStyle]::Bold)
$installBtn.FlatStyle = "Flat"
$installBtn.FlatAppearance.BorderSize = 0
$form.Controls.Add($installBtn)

$closeBtn = New-Object Windows.Forms.Button
$closeBtn.Text = "Fechar"
$closeBtn.Size = New-Object Drawing.Size(100, 45)
$closeBtn.Location = New-Object Drawing.Point(600, 465)
$closeBtn.BackColor = "#ff4444"
$closeBtn.ForeColor = "White"
$closeBtn.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$closeBtn.FlatStyle = "Flat"
$closeBtn.FlatAppearance.BorderSize = 0
$closeBtn.Add_Click({ $form.Close() })
$form.Controls.Add($closeBtn)

$abortBtn = New-Object Windows.Forms.Button
$abortBtn.Text = "Cancelar"
$abortBtn.Size = New-Object Drawing.Size(100, 45)
$abortBtn.Location = New-Object Drawing.Point(490, 465)
$abortBtn.BackColor = "#ff8800"
$abortBtn.ForeColor = "White"
$abortBtn.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$abortBtn.FlatStyle = "Flat"
$abortBtn.FlatAppearance.BorderSize = 0
$abortBtn.Enabled = $false
$form.Controls.Add($abortBtn)

function AddLog {
  param($msg)
  if ($logBox.InvokeRequired) {
    $logBox.Invoke([Action]{ AddLog $msg })
    return
  }
  $logBox.AppendText("$msg`r`n")
  $logBox.SelectionStart = $logBox.Text.Length
  $logBox.ScrollToCaret()
}

function SetStatus {
  param($text)
  if ($statusLabel.InvokeRequired) {
    $statusLabel.Invoke([Action]{ SetStatus $text })
    return
  }
  $statusLabel.Text = $text
}

function SetProgress {
  param($pct)
  if ($progressBar.InvokeRequired) {
    $progressBar.Invoke([Action]{ SetProgress $pct })
    return
  }
  if ($pct -le 100) { $progressBar.Value = $pct }
}

$job = $null
$watchTimer = New-Object Windows.Forms.Timer
$watchTimer.Interval = 300

function StartInstall {
  if (-not (Test-Path $HEADLESS_SCRIPT)) {
    [void][Windows.Forms.MessageBox]::Show("Instalador_Neon.ps1 nao encontrado em:`n$HEADLESS_SCRIPT", "Erro", "OK", "Exclamation")
    return
  }

  $installBtn.Enabled = $false
  $abortBtn.Enabled = $true
  SetStatus "Instalando..."
  SetProgress 0

  $logBox.Clear()
  Add-Content -Path $LOG_FILE -Value "=== Neon Installer $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
  AddLog ">>> Iniciando instalacao..."
  AddLog ">>> Log: $LOG_FILE"

  $script:job = Start-Job -Name "NeonInstall" -ScriptBlock {
    param($scriptPath, $logFile, $progressFile)
    Add-Content -Path $logFile -Value "[JOB] Instalador iniciado em background"

    $originalWriteProgress = ${function:Write-Progress}.ToString()
    ${function:Write-Progress} = {
      param($Activity, $Status, $CurrentOperation, $PercentComplete, $Completed)
      $pct = if ($Completed) { 100 } else { [Math]::Max(0, [Math]::Min(100, $PercentComplete)) }
      $timestamp = Get-Date -Format "HH:mm:ss"
      $line = if ($CurrentOperation) { "[$timestamp] $CurrentOperation" } else { "[$timestamp] $Status" }
      Add-Content -Path $progressFile -Value "PROGRESS:$pct"
      Add-Content -Path $logFile -Value $line
    }

    & $scriptPath
    Add-Content -Path $progressFile -Value "DONE"
    Add-Content -Path $logFile -Value "[JOB] Instalador finalizado"
  } -ArgumentList $HEADLESS_SCRIPT, $LOG_FILE, $PROGRESS_FILE

  Set-Content -Path $PROGRESS_FILE -Value "PROGRESS:0"

  $watchTimer.Add_Tick({
    if (-not (Test-Path $PROGRESS_FILE)) { return }

    $content = Get-Content -Path $PROGRESS_FILE -Tail 1
    if ($content -match "PROGRESS:(\d+)") {
      $pct = [int]$Matches[1]
      SetProgress $pct
    } elseif ($content -eq "DONE") {
      $watchTimer.Stop()
      SetProgress 100
      SetStatus "Instalacao concluida!"
      AddLog "`r`n>>> INSTALACAO CONCLUIDA! <<<"
      $installBtn.Text = " Instalado"
      $abortBtn.Enabled = $false
      $j = Get-Job -Name "NeonInstall" -ErrorAction SilentlyContinue
      if ($j) { Remove-Job $j -Force -ErrorAction SilentlyContinue }
      Remove-Item -Path $PROGRESS_FILE -Force -ErrorAction SilentlyContinue
      return
    }

    if (Test-Path $LOG_FILE) {
      $logContent = Get-Content -Path $LOG_FILE -Tail 5
      foreach ($line in $logContent) { AddLog $line }
    }

    $j = Get-Job -Name "NeonInstall" -ErrorAction SilentlyContinue
    if ($j -and $j.State -eq "Failed") {
      $watchTimer.Stop()
      SetStatus "Instalacao falhou!"
      AddLog ">>> ERRO: Job falhou"
      Receive-Job $j | ForEach-Object { AddLog $_ }
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
  SetStatus "Instalacao cancelada"
  AddLog ">>> Instalacao cancelada pelo usuario"
  $installBtn.Enabled = $true
  $installBtn.Text = " Instalar Neon"
  $abortBtn.Enabled = $false
  SetProgress 0
})

$form.Add_Shown({ $form.Activate() })
[void]$form.ShowDialog()
