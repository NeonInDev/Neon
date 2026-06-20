@echo off
title Neon Installer
fltmc >nul 2>&1 || (
    powershell -Command "Start-Process -Verb RunAs -FilePath '%~f0' -WorkingDirectory '%~dp0'"
    exit /b
)
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "Instalador_Neon.ps1"
pause
