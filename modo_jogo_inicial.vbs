' Modo Jogo - lanca o vigia de tela sem criar NENHUMA janela.
' WScript.Shell.Run com o 3o argumento = 0 (hidden) impede que o powershell.exe
' do System32 apareca. Um .cmd na Inicial nao serviria: o .cmd em si abre o
' proprio console, e um "start "" powershell -WindowStyle Hidden" dentro dele
' so esconde o filho, nao a janela do .cmd.
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\Pichau\Neon\modo_jogo.ps1""", 0, False
