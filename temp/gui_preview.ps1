Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")]
    public static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);
}
'@ -ErrorAction SilentlyContinue

$form = New-Object System.Windows.Forms.Form
$form.Text = "Neon Installer"
$form.Size = New-Object Drawing.Size(800, 640)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "None"
$form.BackColor = "#0a0a0f"
$form.TopMost = $true

$icoPath = "C:\Meus Projetos\Neon\pendrive\assets\neon.ico"
if (Test-Path $icoPath) { try { $form.Icon = [Drawing.Icon]::new($icoPath) } catch {} }

$form.Add_HandleCreated({
  $hwnd = $form.Handle
  $wsEx = [Win32]::GetWindowLong($hwnd, -20)
  [Win32]::SetWindowLong($hwnd, -20, $wsEx -bor 0x20000)
})

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

$titleBar.Add_MouseDown({
  param($s, $e)
  if ($e.Button -eq "Left") {
    $form.Capture = $false
    [Win32]::SendMessage($form.Handle, 0xA1, 0x2, 0) | Out-Null
  }
})

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

$yOff = 55
$titleLbl = New-Object Windows.Forms.Label
$titleLbl.Text = "ASSISTENTE PESSOAL NEON"
$titleLbl.ForeColor = "#00d4ff"
$titleLbl.Font = New-Object Drawing.Font("Segoe UI", 20, [Drawing.FontStyle]::Bold)
$titleLbl.Size = New-Object Drawing.Size(760, 44)
$titleLbl.Location = New-Object Drawing.Point(30, $yOff)
$form.Controls.Add($titleLbl)

$yOff += 44
$subtitleLbl = New-Object Windows.Forms.Label
$subtitleLbl.Text = "Instalação otimizada · Node.js portátil · FFmpeg · Cópia local"
$subtitleLbl.ForeColor = "#606080"
$subtitleLbl.Font = New-Object Drawing.Font("Segoe UI", 10)
$subtitleLbl.Size = New-Object Drawing.Size(760, 20)
$subtitleLbl.Location = New-Object Drawing.Point(32, $yOff)
$form.Controls.Add($subtitleLbl)

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
$progressBar.Value = 35
$progressBar.Style = "Continuous"
$progressBar.ForeColor = "#00d4ff"
$progressBar.BackColor = "#1a1a2e"
$form.Controls.Add($progressBar)

$pctLabel = New-Object Windows.Forms.Label
$pctLabel.Text = "35%"
$pctLabel.ForeColor = "#00d4ff"
$pctLabel.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$pctLabel.Size = New-Object Drawing.Size(50, 20)
$pctLabel.Location = New-Object Drawing.Point(655, $yOff)
$pctLabel.TextAlign = "MiddleLeft"
$form.Controls.Add($pctLabel)

$yOff += 28
$stepLabel = New-Object Windows.Forms.Label
$stepLabel.Text = "EXTRAINDO NODE.JS"
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
$logBox.Text = "[13:05:12] >>> Iniciando instalacao...`r`n[13:05:15] Verificando requisitos... OK`r`n[13:05:18] Copiando projeto Neon...`r`n[13:05:22] Extraindo Node.js...`r`n[13:05:28] Instalando dependencias npm..."
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
$form.Controls.Add($installBtn)

$abortBtn = New-Object Windows.Forms.Button
$abortBtn.Text = "CANCELAR"
$abortBtn.Size = New-Object Drawing.Size(120, 50)
$abortBtn.Location = New-Object Drawing.Point(530, $yOff)
$abortBtn.FlatStyle = "Flat"
$abortBtn.FlatAppearance.BorderSize = 1
$abortBtn.FlatAppearance.BorderColor = "#ff8800"
$abortBtn.FlatAppearance.MouseOverBackColor = "#ff8800"
$abortBtn.BackColor = "#1a1a00"
$abortBtn.ForeColor = "#ff8800"
$abortBtn.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$abortBtn.Cursor = "Hand"
$abortBtn.Enabled = $true
$form.Controls.Add($abortBtn)

$closeBtn2 = New-Object Windows.Forms.Button
$closeBtn2.Text = "FECHAR"
$closeBtn2.Size = New-Object Drawing.Size(120, 50)
$closeBtn2.Location = New-Object Drawing.Point(655, $yOff)
$closeBtn2.FlatStyle = "Flat"
$closeBtn2.FlatAppearance.BorderSize = 1
$closeBtn2.FlatAppearance.BorderColor = "#ff3333"
$closeBtn2.FlatAppearance.MouseOverBackColor = "#ff3333"
$closeBtn2.BackColor = "#1a0000"
$closeBtn2.ForeColor = "#ff6666"
$closeBtn2.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$closeBtn2.Cursor = "Hand"
$closeBtn2.Add_Click({ $form.Close() })
$form.Controls.Add($closeBtn2)

# Screenshot after showing
$form.Add_Shown({
  $form.Activate()
  Start-Sleep -Milliseconds 600
  $bmp = New-Object Drawing.Bitmap(800, 640)
  $g = [Drawing.Graphics]::FromImage($bmp)
  $pt = $form.PointToScreen([Drawing.Point]::Empty)
  $g.CopyFromScreen($pt, [Drawing.Point]::Empty, $form.Size)
  $g.Dispose()
  $bmp.Save("C:\Meus Projetos\Neon\temp\gui_preview.png", [Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $form.Close()
})

[void]$form.ShowDialog()
Write-Host "Screenshot saved"
