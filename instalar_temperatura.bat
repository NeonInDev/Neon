@echo off
REM ============================================================
REM  Neon - Instalar driver de temperatura (LibreHardwareMonitor)
REM  Auto-eleva para admin (voce so da duplo clique e aceita o UAC)
REM ============================================================
setlocal

REM --- Auto-elevacao para admin ---
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo  Solicitando permissoes de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "LHMDIR=C:\Users\Pichau\neon\libs\librehardwaremonitor"
set "DRIVER=%LHMDIR%\LibreHardwareMonitor.sys"
set "SVCNAME=WinRing0_1_2_0"

echo.
echo  Verificando se ja esta instalado...
sc query %SVCNAME% >nul 2>&1
if %errorlevel%==0 (
  echo  O driver %SVCNAME% ja existe.
  echo  NOTA: se ele esta travado (erro 183), e preciso reiniciar o PC
  echo  para o Windows liberar o driver do kernel.
  echo.
  echo  Definindo como AUTO para carregar no proximo boot...
  sc config %SVCNAME% start= auto >nul 2>&1
  echo  Configurado como AUTO.
  echo.
  echo  AGORA REINICIE O PC UMA VEZ (botao Iniciar > Reiniciar).
  echo  No proximo boot o driver de temperatura carrega sozinho.
  pause
  exit /b 0
)

echo.
echo  Instalando driver de kernel: %SVCNAME% ...
sc create %SVCNAME% type= kernel binPath= "\??\%DRIVER%" start= auto error= normal >nul
if not %errorlevel%==0 (
  echo  FALHA ao criar o servico do driver.
  pause
  exit /b 1
)

echo  Tentando iniciar o driver agora...
sc start %SVCNAME% >nul 2>&1
if %errorlevel%==0 (
  echo  Driver iniciado com sucesso!
) else (
  echo  O driver foi criado como AUTO (carrega no proximo boot).
  echo  Se der erro 183, reinicie o PC uma vez para liberar o kernel.
)

echo.
echo  ============================================================
echo  PRONTO! Driver de temperatura instalado.
echo  Agora a Neon consegue ler a temperatura da CPU AMD.
echo  ============================================================
echo.

:stop
sc query %SVCNAME% | findstr /i "STATE" | findstr /i "RUNNING"
if %errorlevel%==0 (
  echo  Driver ESTA RODANDO.
) else (
  echo  NOTA: O driver esta instalado mas nao rodando.
  echo  Se a Neon ainda nao mostrar temperatura, rode novamente como admin
  echo  OU reinicie o PC (o driver carrega no boot).
)

pause