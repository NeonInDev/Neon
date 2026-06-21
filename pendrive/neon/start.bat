@echo off
title Neon - Auto Restart
cd /d "%~dp0"
for /d %%i in ("%~dp0..\node\*") do set "PATH=%%i;%%i\node_modules\.bin;%PATH%"
echo [NEON] Node: %PATH%
echo [NEON] Iniciando com auto-restart...
:loop
echo [NEON] ===== Iniciando em %date% %time% =====
node index.js
echo [NEON] Processo encerrou com codigo %ERRORLEVEL%
timeout /t 5 /nobreak >nul
goto loop
