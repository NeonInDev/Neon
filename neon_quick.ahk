#Requires AutoHotkey >=2.0
#SingleInstance Force

; ─── "Neon, comando" → "/neon comando" (só Discord/Chrome/Opera) ───
#HotIf WinActive("ahk_exe Discord.exe") or WinActive("ahk_class Chrome_WidgetWin_1") or WinActive("ahk_exe opera.exe")
$Enter::
{
    static sending := false
    if sending {
        sending := false
        return
    }

    ; Shift+Enter = nova linha, só passa adiante
    if GetKeyState("Shift", "P") {
        SendInput "{Shift down}{Enter}{Shift up}"
        return
    }

    saved := A_Clipboard
    A_Clipboard := ""
    SendInput "^a"
    Sleep 30
    SendInput "^c"
    Sleep 50
    text := A_Clipboard
    A_Clipboard := saved

    if text = "" {
        SendInput "{Enter}"
        return
    }

    ; Limpa input e re-envia escapando tudo
    SendInput "{Delete}"
    Sleep 20
    esc := StrReplace(text, "`r", "")
    esc := StrReplace(esc, "`n", "{Shift down}{Enter}{Shift up}")
    esc := StrReplace(esc, "!", "{!}")
    esc := StrReplace(esc, "^", "{^}")
    esc := StrReplace(esc, "+", "{+}")
    esc := StrReplace(esc, "#", "{#}")
    esc := StrReplace(esc, "{", "{{}")
    esc := StrReplace(esc, "}", "{}}")

    if RegExMatch(text, "iO)^neon,\s*(.+)", &m) {
        sending := true
        cmd := m[1]
        cmd := StrReplace(cmd, "!", "{!}")
        cmd := StrReplace(cmd, "^", "{^}")
        cmd := StrReplace(cmd, "+", "{+}")
        cmd := StrReplace(cmd, "#", "{#}")
        cmd := StrReplace(cmd, "{", "{{}")
        cmd := StrReplace(cmd, "}", "{}}")
        SendInput esc
        SendInput "{Enter}"
        Sleep 500
        SendInput "/neon " cmd
        SendInput "{Enter}"
    } else {
        SendInput esc
        SendInput "{Enter}"
    }
}
#HotIf


^+N::
{
    ib := InputBox("Digite sua mensagem para a Neon:", "Neon", "w400 h130")
    if ib.Result = "OK" and ib.Value != ""
    {
        res := SendRequest(ib.Value)
        if res = ""
            res := "(sem resposta - servidor offline?)"
        ToolTip(res)
        SetTimer(() => ToolTip(), -8000)
    }
}

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

^+V::
{
    Run('C:\Users\Pichau\AppData\Local\Programs\Microsoft VS Code\Code.exe "C:\Meus Projetos\Neon"')
    Sleep(5000)
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
