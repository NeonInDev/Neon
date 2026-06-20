#Requires -Version 5.1
$REPO = Split-Path -Parent $PSScriptRoot
$DRIVE = $null
$LABEL = "Neon_Iso"

function Show-Menu {
  Clear-Host
  Write-Host @"

  ╔══════════════════════════════════════════╗
  ║     NEON - Sync Pendrive Tool v2.0       ║
  ╚══════════════════════════════════════════╝

"@ -ForegroundColor Cyan
  Write-Host "1) Listar drives removiveis" -ForegroundColor Yellow
  Write-Host "2) Sincronizar para pendrive" -ForegroundColor Yellow
  Write-Host "3) Gerar ISO bootavel" -ForegroundColor Yellow
  Write-Host "4) Abrir pasta do repositorio" -ForegroundColor Yellow
  Write-Host "5) Sair" -ForegroundColor Red
  Write-Host ""
}

function Find-RemovableDrives {
  $drives = Get-WmiObject Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 }
  if (-not $drives) {
    Write-Host "Nenhum pendrive detectado!" -ForegroundColor Red
    return $null
  }
  foreach ($d in $drives) {
    Write-Host "  $($d.DeviceID) - $($d.VolumeName) ($([math]::Round($d.Size/1GB,1)) GB)" -ForegroundColor Green
  }
  return $drives
}

function Sync-ToUSB {
  param($Drive)
  if (-not $Drive) {
    $drives = Find-RemovableDrives
    if (-not $drives) { return }
    $letter = Read-Host "Letra do pendrive (ex: D)"
    $Drive = "${letter}:"
  }

  $target = "$Drive\"
  Write-Host "`nSincronizando para $target ..." -ForegroundColor Cyan

  try {
    New-Item -ItemType Directory -Path "${target}installer" -Force | Out-Null
    New-Item -ItemType Directory -Path "${target}ventoy\theme" -Force | Out-Null
    New-Item -ItemType Directory -Path "${target}assets" -Force | Out-Null
    New-Item -ItemType Directory -Path "${target}scripts" -Force | Out-Null
    New-Item -ItemType Directory -Path "${target}ISO" -Force | Out-Null

    Copy-Item "$REPO\installer\*" "${target}installer\" -Force -Recurse
    if (Test-Path "$REPO\neon") { Copy-Item "$REPO\neon" "${target}neon\" -Recurse -Force }
    if (Test-Path "$REPO\runtimes") { Copy-Item "$REPO\runtimes" "${target}runtimes\" -Recurse -Force }
    Copy-Item "$REPO\instalar.bat" "$target" -Force
    Copy-Item "$REPO\desinstalar.bat" "$target" -Force
    Copy-Item "$REPO\instalar.vbs" "$target" -Force
    Copy-Item "$REPO\desinstalar.vbs" "$target" -Force
    Copy-Item "$REPO\INICIAR.bat" "$target" -Force
    Copy-Item "$REPO\LEIA-ME.txt" "$target" -Force
    Copy-Item "$REPO\diagnosticar.bat" "$target" -Force
    Copy-Item "$REPO\repo.json" "$target" -Force
    Copy-Item "$REPO\autorun.inf" "$target" -Force

    if (Test-Path "$REPO\ventoy\ventoy.json") { Copy-Item "$REPO\ventoy\ventoy.json" "${target}ventoy\" -Force }
    if (Test-Path "$REPO\ventoy\theme\*") { Copy-Item "$REPO\ventoy\theme\*" "${target}ventoy\theme\" -Force }
    if (Test-Path "$REPO\assets\*") { Copy-Item "$REPO\assets\*" "${target}assets\" -Force }

    attrib +H "${target}autorun.inf" *>$null
    Write-Host "`n[OK] Sincronizado com sucesso para ${Drive}!" -ForegroundColor Green
  } catch {
    Write-Host "`n[ERRO] $_" -ForegroundColor Red
  }
}

function New-ISO {
  param([string]$OutputPath = "$REPO\Neon_Installer.iso")
  Write-Host "`nPreparando arquivos para ISO..." -ForegroundColor Yellow

  $workDir = "$env:TEMP\neon_isobuild"
  if (Test-Path $workDir) { Remove-Item -Recurse -Force $workDir }
  New-Item -ItemType Directory -Path $workDir -Force | Out-Null

  Copy-Item "$REPO\installer" "$workDir\installer" -Recurse -Force
  if (Test-Path "$REPO\neon") { Copy-Item "$REPO\neon" "$workDir\neon" -Recurse -Force }
  if (Test-Path "$REPO\runtimes") { Copy-Item "$REPO\runtimes" "$workDir\runtimes" -Recurse -Force }
  if (Test-Path "$REPO\scripts") { Copy-Item "$REPO\scripts" "$workDir\scripts" -Recurse -Force }
  if (Test-Path "$REPO\assets") { Copy-Item "$REPO\assets" "$workDir\assets" -Recurse -Force }
  if (Test-Path "$REPO\installer\neon_env.enc") { Copy-Item "$REPO\installer\neon_env.enc" "$workDir\installer\" -Force }
  Copy-Item "$REPO\instalar.bat" "$workDir\" -Force
  Copy-Item "$REPO\desinstalar.bat" "$workDir\" -Force
  Copy-Item "$REPO\instalar.vbs" "$workDir\" -Force
  Copy-Item "$REPO\desinstalar.vbs" "$workDir\" -Force
  Copy-Item "$REPO\INICIAR.bat" "$workDir\" -Force

  $oscdimg = "${env:ProgramFiles(x86)}\Windows Kits\10\Assessment and Deployment Kit\Deployment Tools\x86\Oscdimg\oscdimg.exe"
  $oscdimg2 = "${env:ProgramFiles(x86)}\Windows Kits\10\Assessment and Deployment Kit\Deployment Tools\amd64\Oscdimg\oscdimg.exe"

  if (Test-Path $oscdimg) {
    & $oscdimg -n -m -l"$LABEL" -bootdata:2#$pxe,$etfsboot=0,0x80 $workDir $OutputPath
    Write-Host "[OK] ISO criada: $OutputPath" -ForegroundColor Green
  } elseif (Test-Path $oscdimg2) {
    & $oscdimg2 -n -m -l"$LABEL" -bootdata:2#$pxe,$etfsboot=0,0x80 $workDir $OutputPath
    Write-Host "[OK] ISO criada: $OutputPath" -ForegroundColor Green
  } else {
    Write-Host "[AVISO] oscdimg.exe nao encontrado." -ForegroundColor Yellow
    Write-Host "Instale o Windows ADK ou copie manualmente os arquivos." -ForegroundColor Yellow
    Write-Host "Os arquivos estao prontos em: $workDir" -ForegroundColor Cyan
  }
}

do {
  Show-Menu
  $choice = Read-Host "Escolha uma opcao"
  switch ($choice) {
    "1" { Find-RemovableDrives; Read-Host "`nPressione Enter" }
    "2" { Sync-ToUSB; Read-Host "`nPressione Enter" }
    "3" { New-ISO; Read-Host "`nPressione Enter" }
    "4" { Invoke-Item $REPO }
    "5" { break }
  }
} while ($choice -ne "5")
