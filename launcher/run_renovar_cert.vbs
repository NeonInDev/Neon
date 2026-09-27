Set WshShell = CreateObject("WScript.Shell")
' 0 = hidden: o processo nasce SEM console. Nao e esconder a janela, e nao
' criar janela. Isso elimina o flash, que nem -WindowStyle Hidden evita,
' porque a janela e criada antes de o PowerShell aplicar o estilo.
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\Users\Pichau\Neon\scripts\renovar_cert_neon.ps1""", 0, False
