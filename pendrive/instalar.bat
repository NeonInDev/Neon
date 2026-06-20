@echo off
title Neon Installer
fltmc >nul 2>&1 || (
    powershell -Command "Start-Process -Verb RunAs -FilePath '%~f0' -WorkingDirectory '%~dp0'"
    exit /b
)
cd /d "%~dp0"
if exist "installer\Instalador_Neon_GUI.ps1" (
    echo Iniciando instalador GUI...
    powershell -ExecutionPolicy Bypass -WindowStyle Normal -File "installer\Instalador_Neon_GUI.ps1"
) else (
    echo Instalador GUI nao encontrado, executando versao console...
    powershell -ExecutionPolicy Bypass -WindowStyle Normal -File "installer\Instalador_Neon.ps1"
)
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERRO] O instalador falhou (codigo %ERRORLEVEL%).
)
pause
