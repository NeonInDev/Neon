#Requires AutoHotkey v2.0

; ===== Neo setup: Ctrl+Shift+Alt+Z e Ctrl+Shift+Alt+X =====
; Abre Medal, Discord, VSCode, Steam e Roblox + liga a Neon (se não estiver online)
; Se você não interagir em 5 minutos, fecha Steam e Roblox.

abrirTudo() {
    static checkIdle

    Run 'C:\Users\Pichau\AppData\Local\Medal\Medal.exe'
    Run 'C:\Users\Pichau\AppData\Local\Discord\Update.exe --processStart Discord.exe'
    Run 'C:\Users\Pichau\AppData\Local\Programs\Microsoft VS Code\Code.exe'
    Run 'C:\Program Files (x86)\Steam\steam.exe'
    Run 'C:\Users\Pichau\AppData\Local\Roblox\Versions\version-4310300497aa4917\RobloxPlayerBeta.exe'

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

    ; Se não houver interação em 5 min (A_TimeIdle ~5 min), fecha Steam e Roblox
    checkIdle := () => {
        if (A_TimeIdle >= 300000) {
            ProcessClose("steam.exe")
            ProcessClose("RobloxPlayerBeta.exe")
            ToolTip 'Steam e Roblox fechados (5 min sem uso).'
            SetTimer(() => ToolTip(), -2500)
            SetTimer(checkIdle, 0)
        }
    }
    SetTimer(checkIdle, 5000)
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