#Requires -Version 5.1
param([switch]$Silent)

$ErrorActionPreference = "Continue"
$Host.UI.RawUI.WindowTitle = "Desinstalar Neon"

function IsJobContext {
  if ($Silent) { return $true }
  $name = $Host.Name
  if ($name -ne "ConsoleHost" -and $name -ne "Windows PowerShell ISE Host") { return $true }
  return $false
}

trap {
  $err = $_.Exception.Message
  Write-Host "`n[ERRO FATAL] $err" -ForegroundColor Red
  Add-Content -Path "$env:USERPROFILE\Desktop\neon_error.txt" -Value "[$(Get-Date)] FATAL: $err"
  if (-not (IsJobContext)) {
    Write-Host "`nPressione Enter para fechar..."
    $null = Read-Host
  }
  exit 1
}

if (-not $Silent -and -not (IsJobContext)) {
  Write-Host "+------------------------------------------+" -ForegroundColor Red
  Write-Host "|      DESINSTALAR NEON v2.0               |" -ForegroundColor Red
  Write-Host "+------------------------------------------+" -ForegroundColor Red
  Write-Host ""
  Write-Host "Isso vai remover TODOS os arquivos da Neon:" -ForegroundColor Yellow
  Write-Host "  * Pasta do projeto ($env:USERPROFILE\Neon)"
  Write-Host "  * Atalhos da area de trabalho"
  Write-Host "  * Memorias e configuracoes salvas"
  Write-Host "  * Perfis do Chrome (WhatsApp, Voz)"
  Write-Host "  * FFmpeg (C:\ffmpeg)"
  Write-Host ""
  $conf = Read-Host "Tem certeza? (S/N)"
  if ($conf -ne "S" -and $conf -ne "s") { Write-Host "Cancelado." -ForegroundColor Gray; exit }
}

$removidos = 0

$pastas = @(
    "$env:USERPROFILE\Neon"
    "$env:LOCALAPPDATA\neon_whatsapp_profile"
    "$env:LOCALAPPDATA\neon_voice_profile"
    "C:\ffmpeg"
)
foreach ($p in $pastas) {
    if (Test-Path $p) {
        try { Remove-Item -Path $p -Recurse -Force -ErrorAction Stop; Write-Host "  [OK] Removido: $p" -ForegroundColor Green; $removidos++ }
        catch { Write-Host "  [!] Falha ao remover $p : $_" -ForegroundColor Red }
    }
}

$atalhos = @(
    "$([Environment]::GetFolderPath('Desktop'))\Neon.lnk"
    "$([Environment]::GetFolderPath('Desktop'))\Neon - Documentacao.lnk"
    "$([Environment]::GetFolderPath('Desktop'))\Neon - Dashboard.lnk"
)
foreach ($a in $atalhos) {
    if (Test-Path $a) { try { Remove-Item -Path $a -Force; Write-Host "  [OK] Atalho: $a" -ForegroundColor Green; $removidos++ } catch { Write-Host "  [!] Falha atalho: $a" -ForegroundColor Red } }
}

try { Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue; Write-Host "  [OK] Processos Node encerrados" -ForegroundColor Green } catch {}

Write-Host ""
if ($removidos -gt 0) {
    Write-Host "Neon removida com sucesso! ($removidos itens)" -ForegroundColor Green
    try { $popup = New-Object -ComObject wscript.shell; $popup.Popup("Neon removida do computador.", 5, "Desinstalar Neon", 64) } catch {}
} else {
    Write-Host "Nenhum arquivo da Neon encontrado." -ForegroundColor Yellow
}
Write-Host ""
if (-not (IsJobContext)) {
  Write-Host "Para reinstalar, execute o Instalador_Neon.ps1" -ForegroundColor Cyan
  Write-Host ""
  pause
}
