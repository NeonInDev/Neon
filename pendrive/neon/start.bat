@echo on
title Neon - Auto Restart
cd /d "%~dp0"
echo [NEON] Iniciando com auto-restart...
:loop
echo [NEON] ===== Iniciando em %date% %time% =====
node index.js
echo [NEON] Processo encerrou com codigo %ERRORLEVEL%
timeout /t 5 /nobreak >nul
goto loop
