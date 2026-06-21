@echo off
title Neon - Diagnosticar Pendrive
echo.
echo ========================================
echo   DIAGNOSTICO DO PENDRIVE NEON
echo ========================================
echo.
echo Verificando arquivos...
echo.

set MISSING=0

if exist "instalar.bat" ( echo   [OK] instalar.bat ) else ( echo   [FALTA] instalar.bat & set /a MISSING+=1 )
if exist "desinstalar.bat" ( echo   [OK] desinstalar.bat ) else ( echo   [FALTA] desinstalar.bat & set /a MISSING+=1 )
if exist "installer\Instalador_Neon.ps1" ( echo   [OK] installer\Instalador_Neon.ps1 ) else ( echo   [FALTA] installer\Instalador_Neon.ps1 & set /a MISSING+=1 )
if exist "installer\Instalador_Neon_GUI.ps1" ( echo   [OK] installer\Instalador_Neon_GUI.ps1 ) else ( echo   [FALTA] installer\Instalador_Neon_GUI.ps1 & set /a MISSING+=1 )
if exist "installer\Desinstalar_Neon.ps1" ( echo   [OK] installer\Desinstalar_Neon.ps1 ) else ( echo   [FALTA] installer\Desinstalar_Neon.ps1 & set /a MISSING+=1 )
if exist "installer\Desinstalar_Neon_GUI.ps1" ( echo   [OK] installer\Desinstalar_Neon_GUI.ps1 ) else ( echo   [FALTA] installer\Desinstalar_Neon_GUI.ps1 & set /a MISSING+=1 )
if exist "neon\index.js" ( echo   [OK] neon\index.js ) else ( echo   [FALTA] neon\index.js & set /a MISSING+=1 )
if exist "neon\package.json" ( echo   [OK] neon\package.json ) else ( echo   [FALTA] neon\package.json & set /a MISSING+=1 )
if exist "runtimes\node\node-v22.14.0-win-x64.zip" ( echo   [OK] Node.js zip ) else ( echo   [FALTA] Node.js zip & set /a MISSING+=1 )
if exist "ventoy\ventoy.json" ( echo   [OK] ventoy\ventoy.json ) else ( echo   [FALTA] ventoy\ventoy.json )
if exist "ventoy\theme\neon_theme.txt" ( echo   [OK] Tema Ventoy ) else ( echo   [FALTA] Tema Ventoy )

echo.
if %MISSING% equ 0 (
    echo   RESULTADO: Pendrive OK! (%MISSING% arquivos faltando)
    echo.
    echo   Para instalar, execute: instalar.bat (como administrador)
) else (
    echo   RESULTADO: %MISSING% arquivo(s) faltando!
    echo   Re-sincronize o pendrive ou baixe do GitHub:
    echo   https://github.com/NeonInDev/Pendrive-Bootavel-Neon---Projeto-Iso
)
echo.
echo Pressione qualquer tecla para sair...
pause >nul
