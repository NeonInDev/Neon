#Requires AutoHotkey >=2.0
#SingleInstance Force

^+N::
{
    ib := InputBox("Digite sua mensagem para a Neon:", "Neon", "w400 h130")
    if ib.Result = "OK" and ib.Value != ""
    {
        ToolTip("Neon: pensando...")
        res := SendRequest(ib.Value)
        ToolTip()
        MsgBox(res != "" ? res : "(sem resposta)", "Neon")
    }
}

SendRequest(msg)
{
    e := msg
    e := StrReplace(e, "\", "\\")
    e := StrReplace(e, '"', '\"')
    e := StrReplace(e, "`n", "\n")
    e := StrReplace(e, "`r", "")

    http := ComObject("WinHttp.WinHttpRequest.5.1")
    http.Open("POST", "http://localhost:3000/api/ask", false)
    http.SetRequestHeader("Content-Type", "application/json")
    http.Send('{"userId":"ahk_local","username":"ahk_local","message":"' e '"}')

    if (http.Status != 200)
        return "Erro HTTP: " http.Status

    d := http.ResponseText
    if RegExMatch(d, '"reply":\s*"(.*)"\s*}', &m) {
        r := m[1]
        r := StrReplace(r, "\n", "`n")
        r := StrReplace(r, "\\", "\")
        r := StrReplace(r, '\"', '"')
        return r
    }
    return d
}
