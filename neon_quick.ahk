#Requires AutoHotkey >=2.0
#SingleInstance Force

myGui := ""

^+N::CriarGui()

CriarGui()
{
    global myGui
    if WinExist("Neon ahk_class AutoHotkeyGUI") {
        WinActivate
        return
    }
    myGui := Gui("+AlwaysOnTop +ToolWindow -Caption +Border", "Neon")
    myGui.BackColor := "1e1e2e"
    myGui.SetFont("s11 cWhite", "Segoe UI")
    myGui.Add("Text", "x10 y8 w380 h24", "Neon — digite sua mensagem:")
    myGui.SetFont("s10")
    ec := myGui.Add("Edit", "x10 y32 w380 h26")
    myGui.Add("Button", "Hidden Default", "OK").OnEvent("Click", Enviar)
    myGui.OnEvent("Escape", Fechar)
    myGui.OnEvent("Close", Fechar)
    myGui.Show("w400 h68")
    ec.Focus()
}

Enviar(*)
{
    global myGui
    if !myGui || !myGui.Hwnd
        return
    salvo := myGui.Submit(false)
    msg := salvo["Edit1"]
    if (msg = "")
        return
    myGui.Destroy()
    ToolTip("Neon: pensando...")
    res := SendRequest(msg)
    ToolTip()
    MsgBox(res != "" ? res : "(sem resposta)", "Neon")
}

Fechar(*)
{
    global myGui
    if myGui
        myGui.Destroy()
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
