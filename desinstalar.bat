@echo off
title Neon Uninstaller
fltmc >nul 2>&1 || (
    powershell -Command "Start-Process -Verb RunAs -FilePath '%~f0' -WorkingDirectory '%~dp0'"
    exit /b
)
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "Desinstalar_Neon.ps1"
pause
