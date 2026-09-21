@echo off
title Neon - Auto Restart
cd /d "%~dp0"
echo [NEON] Iniciando com auto-restart...
:loop
if exist "nao_religar.flag" (
  echo [NEON] Flag nao_religar encontrada - neon nao vai ligar.
  goto fim
)
echo [NEON] ===== Iniciando em %date% %time% =====
node index.js
echo [NEON] Processo encerrou com codigo %ERRORLEVEL%
timeout /t 5 /nobreak >nul
goto loop
:fim
echo [NEON] Saida limpa.