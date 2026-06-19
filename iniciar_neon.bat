@echo off
title Neon - Assistente IA
cd /d "%~dp0"

:MENU
cls
echo.
echo ========================================
echo         NEON - Assistente Pessoal
echo ========================================
echo.
if not exist ".env" (
    echo [AVISO] Arquivo .env nao encontrado!
    echo Crie um arquivo .env com:
    echo   DISCORD_TOKEN=seu_token
    echo   GEMINI_API_KEY=sua_key
    echo   OPENROUTER_API_KEY=sua_key
    echo.
    echo Pressione qualquer tecla para continuar mesmo assim,
    echo ou feche a janela para criar o .env primeiro.
    pause >nul
    cls
)

echo [INICIANDO NEON...]
echo.
echo Data: %DATE% %TIME%
echo.

:: Verifica se o Node esta instalado
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado!
    echo Execute o instalador: scripts\instalar_neon.ps1
    echo Ou instale manualmente: winget install OpenJS.NodeJS
    pause
    exit /b 1
)

node index.js

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Neon fechou com codigo %errorlevel%
    pause
    goto MENU
)
