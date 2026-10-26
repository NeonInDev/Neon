$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$base = Join-Path $root ".neon-opencode\piper"
$runtime = Join-Path $base "runtime"
$models = Join-Path $base "models"
$exe = Join-Path $runtime "piper\piper.exe"
$model = Join-Path $models "pt_BR-faber-medium.onnx"
$config = "$model.json"
$archive = Join-Path $base "piper_windows_amd64.zip"

New-Item -ItemType Directory -Force -Path $base, $runtime, $models | Out-Null

if (-not (Test-Path -LiteralPath $exe)) {
  Invoke-WebRequest -Uri "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip" -OutFile $archive
  Expand-Archive -LiteralPath $archive -DestinationPath $runtime -Force
  Remove-Item -LiteralPath $archive -Force
}

if (-not (Test-Path -LiteralPath $model)) {
  Invoke-WebRequest -Uri "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx" -OutFile $model
}

if (-not (Test-Path -LiteralPath $config)) {
  Invoke-WebRequest -Uri "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx.json" -OutFile $config
}

Write-Output "Voz Piper pt-BR instalada para uso offline."
