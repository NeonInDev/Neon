@echo off
title Neon Installer
echo ============================================
echo          NEON - Assistente Pessoal
echo ============================================
echo.
echo Escolha uma opcao:
echo   1 - Instalar Neon
echo   2 - Desinstalar Neon
echo   3 - Diagnosticar pendrive
echo.
set /p op="Opcao (1-3): "
if "%op%"=="1" start "" "%~dp0instalar.bat"
if "%op%"=="2" start "" "%~dp0desinstalar.bat"
if "%op%"=="3" start "" "%~dp0diagnosticar.bat"
