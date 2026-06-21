@echo off
title Neon - Matar Processos
echo.
echo ========================================
echo   MATANDO PROCESSOS DA NEON E BUN
echo ========================================
echo.
echo Node:
taskkill /f /im node.exe 2>nul && echo   [OK] Node encerrado || echo   [-] Nenhum node.exe
echo.
echo Bun:
taskkill /f /im bun.exe 2>nul && echo   [OK] Bun encerrado || echo   [-] Nenhum bun.exe
taskkill /f /im bunx.exe 2>nul && echo   [OK] Bunx encerrado || echo   [-] Nenhum bunx.exe
echo.
echo ========================================
echo   Processos encerrados. Pode reiniciar.
echo ========================================
timeout /t 3 /nobreak >nul
