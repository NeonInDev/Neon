@echo off
title Habilitar Hibernacao (Neon)
echo.
echo ============================================
echo   Habilitando hibernacao do Windows
echo   (necessario para acordar sozinho as 17:25)
echo ============================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Solicitando permissao de administrador...
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo [1/2] Habilitando hibernacao...
powercfg /hibernate on

echo [2/2] Verificando...
powercfg /a | findstr /i "hiberna"

echo.
echo [OK] Hibernacao habilitada.
echo Se o computador nao aparecer como "Hibernar",
echo reinicie o PC e rode este script de novo.
echo.
pause