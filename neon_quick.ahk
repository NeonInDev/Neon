; ==================================================
; Neon Quick Hotkeys (AHK v2) — SEM Steam/Roblox
; ==================================================
; Ctrl+Shift+Alt+Z = abre Medal, Discord, VSCode + garante Neon online
; Ctrl+Shift+Alt+B = reinicia a Neon (para/sobe de novo)
; F8 = status da Neon (tooltip)
; ==================================================
#Requires AutoHotkey >=2.0
#SingleInstance Force

; ===== ABRIR TUDO (Medal, Discord, VSCode) + garantir Neon =====
^!+Z::
{
    Run 'C:\Users\Pichau\AppData\Local\Medal\Medal.exe'
    Run 'C:\Users\Pichau\AppData\Local\Discord\Update.exe --processStart Discord.exe'
    Run 'C:\Users\Pichau\AppData\Local\Programs\Microsoft VS Code\Code.exe'

    ; Ligar a Neon só se ela ainda não estiver online (proteção anti-duplicata)
    if (!neonOnline()) {
        FileDelete 'C:\Users\Pichau\Neon\nao_religar.flag'
        Run 'cmd.exe /c start "" /d "C:\Users\Pichau\Neon" "C:\Users\Pichau\Neon\start.bat"', , "Hide"
        ToolTip 'Abrindo tudo... Neon ligando.'
    } else {
        ToolTip 'Tudo aberto. Neon já estava online.'
    }
    SetTimer(() => ToolTip(), -2500)
    return
}

; ===== REINICIAR NEON (Ctrl+Shift+Alt+B) =====
^!+B::
{
    Run 'cmd.exe /c "taskkill /f /im node.exe & cd /d C:\Users\Pichau\Neon & start /min cmd /c node index.js"', , "Hide"
    ToolTip 'Neon reiniciando...'
    SetTimer(() => ToolTip(), -2500)
    return
}

; ===== STATUS NEON (F8) =====
F8::
{
    if (neonOnline()) {
        ToolTip 'Neon: ONLINE (100.115.96.52:3000)'
    } else {
        ToolTip 'Neon: OFFLINE — Ctrl+Shift+Alt+Z para abrir tudo + ligar.'
    }
    SetTimer(() => ToolTip(), -3500)
    return
}

; ===== HEALTH CHECK =====
neonOnline()
{
    try {
        req := ComObject("WinHttp.WinHttpRequest.5.1")
        req.Open("GET", "http://100.115.96.52:3000/api/saude", true)
        req.SetTimeouts(3000, 3000, 3000, 3000)
        req.Send()
        req.WaitForResponse(3)
        if (req.Status = 200)
            return true
    }
    return false
}