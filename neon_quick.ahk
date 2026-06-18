#Requires AutoHotkey >=2.0
#SingleInstance Force

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
    Run('cmd /k "title Neon Bot && cd /d C:\Meus Projetos\Neon && node index.js"', , "Max")
}

^+V::
{
    Run('C:\Users\Pichau\AppData\Local\Programs\Microsoft VS Code\Code.exe "C:\Meus Projetos\Neon"')
    Sleep(500)
    Run('cmd /k "title Neon Bot && cd /d C:\Meus Projetos\Neon && node index.js"', , "Max")
}

^+X::
{
    RunWait('powershell -NoProfile -Command "Stop-Process -Name node -Force"', , "Hide")
    Run('cmd /c "title Neon Bot && echo Bot encerrado. && timeout /t 3"', , "Max")
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
