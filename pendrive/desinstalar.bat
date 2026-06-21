@echo off
title Neon Uninstaller v2.0
cd /d "%~dp0"

set LOGFILE=%USERPROFILE%\Desktop\neon_uninstall_log.txt
echo [%DATE% %TIME%] Iniciando... > "%LOGFILE%"

fltmc >nul 2>&1 || (
    powershell -Command "Start-Process -Verb RunAs -FilePath '%~f0' -WorkingDirectory '%~dp0' -WindowStyle Normal"
    exit /b
)

if not exist "installer\Desinstalar_Neon_GUI.ps1" (
    echo [ERRO] Desinstalador nao encontrado!
    pause >nul
    exit /b 1
)

echo [%DATE% %TIME%] Executando GUI... >> "%LOGFILE%"
powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "installer\Desinstalar_Neon_GUI.ps1"
set GUI_EXIT=%ERRORLEVEL%

if %GUI_EXIT% equ 0 exit /b 0

echo [%DATE% %TIME%] GUI falhou (%GUI_EXIT%) >> "%LOGFILE%"
echo.
echo ============================================
echo   ERRO: O desinstalador GUI falhou (%GUI_EXIT%).
echo ============================================
echo.
pause
