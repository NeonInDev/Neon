@echo off
title Neon - Assistente IA
fltmc >nul 2>&1 || (
    powershell -Command "Start-Process -Verb RunAs -FilePath '%~f0' -WorkingDirectory '%~dp0'"
    exit /b
)
cd /d "%~dp0"
:MENU
cls
echo.
echo ========================================
echo         NEON - Assistente Pessoal
echo ========================================
echo.
if not exist ".env" (
    echo [AVISO] .env nao encontrado
    echo Crie o arquivo com DISCORD_TOKEN e GEMINI_API_KEY
    echo.
    pause
)
echo [INICIANDO NEON...]
echo.
where node >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado!
    pause
    exit /b 1
)
node index.js
if errorlevel 1 pause
goto MENU