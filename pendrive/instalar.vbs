Dim fso, dir
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetFile(Wscript.ScriptFullName).ParentFolder
CreateObject("Shell.Application").ShellExecute "powershell.exe", "-ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\installer\Instalador_Neon_GUI.ps1""", dir, "runas", 0
