#Requires AutoHotkey >=2.0
#SingleInstance Force

; ─── Só ativo no Discord / Chrome / Opera (NUNCA no VS Code/Electron!) ───
#HotIf (WinActive("ahk_exe Discord.exe") or WinActive("ahk_exe chrome.exe") or WinActive("ahk_exe opera.exe")) and !WinActive("ahk_exe Code.exe")

; Bloqueia Enter ($) e re-envia: se "Neon," → "/neon ...", senão → mensagem original
$Enter::
{
    static sending := false
    if sending {
        sending := false
        return
    }
    try {
        saved := A_Clipboard
        A_Clipboard := ""
        SendInput "^a"
        Sleep 30
        SendInput "^c"
        Sleep 50
        text := A_Clipboard
        A_Clipboard := saved
        if RegExMatch(text, "i)^neon,\s*(.+)") {
            cmd := RegExReplace(text, "i)^neon,\s*", "")
            sending := true
            Sleep 300
            cmd := StrReplace(cmd, "!", "{!}")
            cmd := StrReplace(cmd, "^", "{^}")
            cmd := StrReplace(cmd, "+", "{+}")
            cmd := StrReplace(cmd, "#", "{#}")
            cmd := StrReplace(cmd, "{", "{{}")
            cmd := StrReplace(cmd, "}", "{}}")
            SendInput "/neon " cmd
            SendInput "{Enter}"
        } else {
            ; Mensagem sem "Neon," → re-envia original na hora
            SendInput text
            SendInput "{Enter}"
        }
    } catch as err {
        ToolTip "Neon AHK erro:`n" err.Message "`n`nLine: " err.Line
        SetTimer(() => ToolTip(), -8000)
    }
}

#HotIf

; ─── Atalhos globais (funcionam de qualquer lugar) ───

; ─── GUI Neon Chat (Ctrl+Shift+N) ───
^+N::
{
    if WinExist("Neon Chat")
    {
        WinActivate("Neon Chat")
        return
    }
    CriarGuiNeon()
}

CriarGuiNeon()
{
    local gui := Gui("+Resize +MinSize460x380", "Neon Chat")
    gui.BackColor := "1a1a2e"
    gui.SetFont("s11 cFFFFFF", "Segoe UI")

    ; Cabeçalho
    gui.SetFont("s14 bold c00d4ff", "Segoe UI")
    gui.Add("Text", "x15 y12 w430 h30 +0x200", "💬 NEON CHAT")
    gui.SetFont("s10 cCCCCCC", "Segoe UI")

    ; Área de resposta (read-only, scroll)
    resp := gui.Add("Edit", "x15 y50 w430 h230 ReadOnly vResposta Background2d2d44 cFFFFFF -Wrap")
    resp.Value := "Bem-vindo ao Neon Chat! Digite sua mensagem abaixo.`r`n`r`nDica: pressione ENTER para enviar."

    ; Área de input + botão
    inp := gui.Add("Edit", "x15 y295 w345 h32 vMensagem Background2d2d44 cFFFFFF")
    btn := gui.Add("Button", "x370 y294 w75 h34 +Default", "Enviar")

    ; Status bar
    gui.SetFont("s9 c888888", "Segoe UI")
    gui.Add("Text", "x15 y340 w430 h20 vStatus", "Pronto. Ctrl+Shift+N para reabrir.")

    btn.OnEvent("Click", (*) => EnviarNeon(inp, resp))
    ; Enter no input dispara o botão Default (Enviar) automaticamente
    gui.OnEvent("Close", (*) => gui.Destroy())
    gui.OnEvent("Size", (gui, *) => RedimensionarGui(gui, resp, inp, btn))

    gui.Show("w460 h380")
    return gui
}

RedimensionarGui(gui, resp, inp, btn)
{
    try {
        w := gui.ClientPos.w
        h := gui.ClientPos.h
        resp.Move(15, 50, w - 30, h - 150)
        inp.Move(15, h - 85, w - 115, 32)
        btn.Move(w - 90, h - 86, 75, 34)
    }
}

EnviarNeon(inp, resp)
{
    msg := inp.Value
    if msg = ""
        return
    resp.Value := "Aguardando resposta..." "`r`n`r`n" resp.Value
    inp.Value := ""
    res := SendRequest(msg)
    if res = ""
        res := "(sem resposta - servidor offline?)`r`nTente Ctrl+Shift+V para iniciar o bot."
    resp.Value := res "`r`n---`r`n" resp.Value
}

; ─── Iniciar Bot (Ctrl+Shift+V — preferido) ───
^+V::
{
    if !WinExist("ahk_exe Code.exe")
    {
        Run('C:\Users\Pichau\AppData\Local\Programs\Microsoft VS Code\Code.exe "C:\Meus Projetos\Neon"')
        Sleep(5000)
    }
    else
    {
        WinActivate("ahk_exe Code.exe")
        Sleep(300)
    }
    Send("^+p")
    Sleep(600)
    Send("Terminal: Create New Terminal{Enter}")
    Sleep(1500)
    Send("node index.js{Enter}")
}

; ─── Iniciar Bot alternativo (Ctrl+Shift+B) ───
^+B::
{
    if !WinExist("ahk_exe Code.exe")
    {
        Run('C:\Users\Pichau\AppData\Local\Programs\Microsoft VS Code\Code.exe "C:\Meus Projetos\Neon"')
        Sleep(5000)
    }
    else
    {
        WinActivate("ahk_exe Code.exe")
        Sleep(300)
    }
    Send("^+p")
    Sleep(600)
    Send("Terminal: Create New Terminal{Enter}")
    Sleep(1500)
    Send("node index.js{Enter}")
}

^+X::
{
    if WinExist("ahk_exe Code.exe")
    {
        WinActivate("ahk_exe Code.exe")
        Sleep(300)
        Send("^+p")
        Sleep(600)
        Send("Terminal: Focus on Terminal{Enter}")
        Sleep(500)
        Send("^{c}")
        Sleep(1000)
        Run('cmd /c "echo Bot encerrado. && timeout /t 3"', , "Max")
    }
    else
    {
        RunWait('powershell -NoProfile -Command "Stop-Process -Name node -Force"', , "Hide")
        Run('cmd /c "echo Bot encerrado. && timeout /t 3"', , "Max")
    }
}

SendRequest(msg)
{
    static http := ""
    if !http
        http := ComObject("WinHttp.WinHttpRequest.5.1")

    safe := JsonEncode(msg)

    try {
        http.SetTimeouts(5000, 5000, 5000, 10000)
        http.Open("POST", "http://localhost:3000/api/ask", false)
        http.SetRequestHeader("Content-Type", "application/json")
        http.Send('{"userId":"ahk_local","username":"Atalho","message":' safe '}')

        if (http.Status != 200)
            return "Erro HTTP: " http.Status "`n" http.ResponseText

        return JsonDecode(http.ResponseText)
    } catch {
        return "Erro de conexão. O servidor da Neon está rodando?`n`nTente Ctrl+Shift+B para iniciar."
    }
}

JsonEncode(str)
{
    str := StrReplace(str, "\", "\\")
    str := StrReplace(str, '"', '\"')
    str := StrReplace(str, "`n", "\n")
    str := StrReplace(str, "`r", "")
    str := StrReplace(str, "`t", "\t")
    return '"' str '"'
}

JsonDecode(text)
{
    if RegExMatch(text, '"reply":\s*"(.*)"\s*}', &m)
    {
        r := m[1]
        r := StrReplace(r, '\"', '"')
        r := StrReplace(r, "\\", "\")
        r := StrReplace(r, "\n", "`n")
        r := StrReplace(r, "\t", "`t")
        return r
    }
    start := InStr(text, '"reply": "') + 10
    if start > 10
    {
        end := InStr(text, '"', false, start)
        if end > start
            return SubStr(text, start, end - start)
    }
    return text
}
