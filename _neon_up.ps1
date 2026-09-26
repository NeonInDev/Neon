# Dispatcher da Neon: sobe a bot via start.bat e mantem ela viva.
#
# Duas correcoes em relacao a versao anterior:
#  1) A checagem era "existe ALGUM processo node?". Neste PC rodam o opencode,
#     o WhatsApp e outros processos node, entao a Neon aparecia como viva
#     mesmo estando morta - e nunca era reiniciada. Agora checamos a PORTA 3000,
#     que e aberta so pela API da Neon. (O wmic/CIM nao pode ser usado aqui:
#     trava o PC. Por isso netstat.)
#  2) Sem trava, dois dispatchers (ex.: logon + boot) subiam duas instancias
#     da Neon, e as duas brigavam pelo mesmo token no Discord. Agora usa um
#     mutex nomeado: o segundo processo sai na hora.
#
# Sem acentos de proposito: .ps1 sem BOM corrompe caracteres.
$ErrorActionPreference = "Continue"
$dir = "C:\Users\Pichau\Neon"
$log = Join-Path $dir "logs\dispatcher.log"
$Intervalo = 10   # segundos entre checagens
$Boot = 60        # tempo maximo que a Neon leva para abrir a porta 3000

# --- trava: so um dispatcher por vez ---------------------------------------
$mutex = New-Object System.Threading.Mutex($false, "NeonDispatcherPichau")
if (-not $mutex.WaitOne(0)) { exit 0 }

function Registrar($msg) {
    Add-Content -LiteralPath $log -Value ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg) -Encoding UTF8
}

# A Neon esta viva se (e so se) alguem esta escutando na porta 3000.
function NeonViva {
    return [bool](netstat -ano | Select-String ":3000\s+.*LISTENING")
}

try {
    Registrar "dispatcher online (checagem a cada ${Intervalo}s, boot ate ${Boot}s)"
    while ($true) {
        if (NeonViva) {
            Start-Sleep -Seconds $Intervalo
            continue
        }

        Registrar "Neon fora do ar - subindo via start.bat"
        $arg = '/c start "" /d "' + $dir + '" "' + (Join-Path $dir "start.bat") + '"'
        Start-Process -FilePath "cmd.exe" -ArgumentList $arg -WorkingDirectory $dir -WindowStyle Hidden

        # Espera a porta abrir antes de decidir de novo, senao o laco dispara
        # varias vezes durante o boot e sobe varias instancias.
        $esperado = 0
        while ($esperado -lt $Boot) {
            Start-Sleep -Seconds 5
            $esperado += 5
            if (NeonViva) { break }
        }

        if (NeonViva) { Registrar "Neon de volta no ar (${esperado}s)" }
        else { Registrar "ATENCAO: Neon nao abriu a porta 3000 em ${Boot}s - checar logs\neon.log" }
    }
}
finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
