@echo off
title Neon - Sincronizar Pendrive
fltmc >nul 2>&1 || (
    powershell -Command "Start-Process -Verb RunAs -FilePath '%~f0' -WorkingDirectory '%~dp0'"
    exit /b
)
cd /d "%~dp0"
echo.
echo ========================================
echo   Sincronizar Neon para Pendrive
echo ========================================
echo.
set /p DRIVE="Digite a letra do pendrive (ex: D): "
if not defined DRIVE set DRIVE=D
set DRIVE=%DRIVE%:\
if not exist %DRIVE% (
    echo [ERRO] Drive %DRIVE% nao encontrado!
    pause
    exit /b 1
)
echo.
echo Sincronizando para %DRIVE% ...
mkdir "%DRIVE%installer" 2>nul
mkdir "%DRIVE%ventoy\theme" 2>nul
mkdir "%DRIVE%assets" 2>nul
mkdir "%DRIVE%scripts" 2>nul
mkdir "%DRIVE%ISO" 2>nul

copy /Y "installer\*" "%DRIVE%installer\" >nul
copy /Y "instalar.bat" "%DRIVE%" >nul
copy /Y "desinstalar.bat" "%DRIVE%" >nul
copy /Y "autorun.inf" "%DRIVE%" >nul
if exist "ventoy\ventoy.json" copy /Y "ventoy\ventoy.json" "%DRIVE%ventoy\" >nul
if exist "ventoy\theme\*" copy /Y "ventoy\theme\*" "%DRIVE%ventoy\theme\" >nul

attrib +H "%DRIVE%autorun.inf"
attrib +R "%DRIVE%installer\*.ps1"
attrib +R "%DRIVE%installer\*.js"
attrib +R "%DRIVE%installer\*.enc"

echo.
echo [OK] Neon sincronizado para %DRIVE%!
echo.
pause
