#Requires AutoHotkey >=2.0
#SingleInstance Force

; ===== Neo setup: Ctrl+Shift+Alt+Z e Ctrl+Shift+Alt+X =====
; Abre Medal, Discord e VSCode + liga a Neon (se não estiver online)
; 25/09: Steam e Roblox REMOVIDOS do atalho (dono não quer mais que abram)

abrirTudo() {
    Run 'C:\Users\Pichau\AppData\Local\Medal\Medal.exe'
    Run 'C:\Users\Pichau\AppData\Local\Discord\Update.exe --processStart Discord.exe'
    Run 'C:\Users\Pichau\AppData\Local\Programs\Microsoft VS Code\Code.exe'

    ; Ligar a Neon só se ela ainda não estiver online (proteção anti-duplicata)
    if (!neonOnline()) {
        ; Remove trava de desligamento deliberado e liga
        FileDelete 'C:\Users\Pichau\Neon\nao_religar.flag'
        Run 'cmd.exe /c start "" /d "C:\Users\Pichau\Neon" "C:\Users\Pichau\Neon\start.bat"', , "Hide"
        ToolTip 'Abrindo tudo... Neon ligando.'
    } else {
        ToolTip 'Tudo aberto. Neon já estava online.'
    }
    SetTimer(() => ToolTip(), -2500)
}

; Checka se a Neon está online via API de health
neonOnline() {
    try {
        req := ComObject("WinHttp.WinHttpRequest.5.1")
        req.Open("GET", "http://100.115.96.52:3000/health", true)
        req.SetRequestHeader("x-hud-key", "TESEU")
        req.SetTimeouts(3000, 3000, 3000, 3000)
        req.Send()
        req.WaitForResponse(3)
        if (req.Status = 200)
            return true
    }
    return false
}

^!+z::
{
    abrirTudo()
    return
}

^!+x::
{
    abrirTudo()
    return
}
