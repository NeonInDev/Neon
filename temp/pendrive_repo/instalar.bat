@echo off
title Neon Installer v4.0
cd /d "%~dp0"

set LOGFILE=%USERPROFILE%\Desktop\neon_install_log.txt
echo [%DATE% %TIME%] Iniciando... > "%LOGFILE%"

:: Request admin
fltmc >nul 2>&1 || (
    echo [%DATE% %TIME%] Solicitando admin... >> "%LOGFILE%"
    powershell -Command "Start-Process -Verb RunAs -FilePath '%~f0' -WorkingDirectory '%~dp0' -WindowStyle Normal"
    exit /b
)

if not exist "installer\Instalador_Neon_GUI.ps1" (
    echo [ERRO] Instalador nao encontrado!
    echo Execute este bat da RAIZ do pendrive.
    pause >nul
    exit /b 1
)

:: Launch GUI hidden (no terminal window)
echo [%DATE% %TIME%] Executando GUI... >> "%LOGFILE%"
powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "installer\Instalador_Neon_GUI.ps1"
set GUI_EXIT=%ERRORLEVEL%

:: If GUI succeeded, done (clean exit, no terminal)
if %GUI_EXIT% equ 0 exit /b 0

:: GUI failed - show terminal with error
echo [%DATE% %TIME%] GUI falhou (codigo %GUI_EXIT%) >> "%LOGFILE%"
echo.
echo ============================================
echo   ERRO: O instalador GUI falhou (%GUI_EXIT%).
echo   Veja o log em: %LOGFILE%
echo ============================================
echo.
echo Tente executar diretamente:
echo   powershell -ExecutionPolicy Bypass -File "installer\Instalador_Neon.ps1"
echo.
pause
