@echo off
title Neon Uninstaller
fltmc >nul 2>&1 || (
    powershell -Command "Start-Process -Verb RunAs -FilePath '%~f0' -WorkingDirectory '%~dp0'"
    exit /b
)
cd /d "%~dp0"
if exist "installer\Desinstalar_Neon_GUI.ps1" (
    echo Iniciando desinstalador GUI...
    powershell -ExecutionPolicy Bypass -WindowStyle Normal -File "installer\Desinstalar_Neon_GUI.ps1"
) else (
    echo Desinstalador GUI nao encontrado, executando versao console...
    powershell -ExecutionPolicy Bypass -WindowStyle Normal -File "installer\Desinstalar_Neon.ps1"
)
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERRO] O desinstalador falhou (codigo %ERRORLEVEL%).
)
pause
