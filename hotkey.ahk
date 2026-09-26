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

; ===== Reinício da Neon: Ctrl+Shift+N =====
; Para a Neon de um jeito limpo: pede o encerramento gracioso pela API
; e espera ela voltar. Se ela nao voltar sozinha, relanca pelo start.bat.
; (Nao usa taskkill: o PID e' de um processo que pode ser outro)

reiniciarNeon() {
    ToolTip 'Reiniciando a Neon...'

    if (neonOnline()) {
        tentarDesligar()
        ; espera ela cair
        if (!esperarNeon(false, 10)) {
            ; ainda de pe apos o pedido: força o relançamento do start.bat
            ; (o start.bat tem auto-restart proprio)
            Run 'cmd.exe /c start "" /d "C:\Users\Pichau\Neon" "C:\Users\Pichau\Neon\start.bat"', , "Hide"
        }
    } else {
        Run 'cmd.exe /c start "" /d "C:\Users\Pichau\Neon" "C:\Users\Pichau\Neon\start.bat"', , "Hide"
    }

    if (esperarNeon(true, 45)) {
        ToolTip 'Neon reiniciada. Deu bom.'
    } else {
        ToolTip 'Neon nao voltou. Olha o log.'
    }
    SetTimer(() => ToolTip(), -3000)
}

; pede o encerramento gracioso (a API emite SIGTERM)
tentarDesligar() {
    try {
        req := ComObject("WinHttp.WinHttpRequest.5.1")
        req.Open("POST", "http://100.115.96.52:3000/api/shutdown", true)
        req.SetRequestHeader("x-hud-key", "TESEU")
        req.SetRequestHeader("Content-Type", "application/json")
        req.SetTimeouts(3000, 3000, 3000, 3000)
        req.Send("{}")
        req.WaitForResponse(3)
    } catch {
        ; endpoint fora do ar: o start.bat abaixo cobre esse caso
    }
}

; espera a Neon ficar online (true) ou offline (false)
esperarNeon(alvo, segundos) {
    limite := A_TickCount + (segundos * 1000)
    while (A_TickCount < limite) {
        if (neonOnline() = alvo)
            return true
        Sleep(700)
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

^+n::
{
    reiniciarNeon()
    return
}
