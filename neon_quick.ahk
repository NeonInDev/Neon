#Requires AutoHotkey >=2.0
#SingleInstance Force
#Persistent

^+N::
{
    ib := InputBox("Digite sua mensagem para a Neon:", "Neon", "w400 h130")
    if ib.Result = "OK" and ib.Value != ""
    {
        ToolTip("Neon: pensando...")
        res := SendRequest(ib.Value)
        ToolTip()
        if res = ""
            res := "(sem resposta - servidor offline?)"
        MsgBox(res, "Neon", 4096)
    }
}

^+B::
{
    RunWait('powershell -NoProfile -Command "node C:\Meus Projetos\Neon\index.js"', , "Hide")
}

^+V::
{
    ToolTip("Neon: iniciando VS Code + Neon...")
    RunWait('C:\Users\Pichau\AppData\Local\Programs\Microsoft VS Code\Code.exe "C:\Meus Projetos\Neon"', , "Max")
    RunWait('powershell -NoProfile -Command "node C:\Meus Projetos\Neon\index.js"', , "Hide")
    ToolTip()
}

SendRequest(msg)
{
    static http := ""
    if !http
        http := ComObject("WinHttp.WinHttpRequest.5.1")

    safe := JsonEncode(msg)

    try {
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
