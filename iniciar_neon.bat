@echo off
title Neon - Assistente IA
fltmc >nul 2>&1 || (
    powershell -Command "Start-Process -Verb RunAs -FilePath '%~f0' -WorkingDirectory '%~dp0'"
    exit /b
)
cd /d "%~dp0"
set PATH=%~dp0git\cmd;%~dp0node;%PATH%
if not exist ".env" (
    echo [AVISO] .env nao encontrado
    pause
)
echo [INICIANDO NEON...]
echo Para parar: feche a janela ou pressione Ctrl+C
:LOOP
node index.js
echo [REINICIANDO NEON em 3 segundos...]
timeout /t 3 /nobreak >nul
goto LOOP
