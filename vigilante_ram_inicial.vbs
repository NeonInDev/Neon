' Launcher invisivel do Vigilante de RAM da Neon.
'
' USE ESTE ARQUIVO, nao um .cmd, na pasta Inicial.
'
' Motivo: um .cmd solto na Inicial (NeonVigilanteRAM.cmd) SEMPRE ganha o
' proprio console, mesmo contendo "start "" powershell -WindowStyle Hidden"
' dentro. O -WindowStyle esconde o powershell filho, mas nao esconde a janela
' do proprio .cmd, que dura o tempo do start. Resultado: powershell.exe
' aparecendo na tela do dono a cada login e a cada wake.
'
' Com WScript.Shell.Run(..., 0, ...) o processo nasce sem janela nenhuma.
'
' Para instalar, copie este arquivo para:
'   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\
' e apague o antigo NeonVigilanteRAM.cmd de la.
'
' O Powershell do vigilante ja vai com -WindowStyle Hidden, entao o script
' vigilante_ram.ps1 e a notificacao WinForms continuam funcionando.

Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\Pichau\Neon\vigilante_ram.ps1""", 0, False
