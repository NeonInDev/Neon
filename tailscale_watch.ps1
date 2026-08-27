param([int]$Poll = 600, [int]$Cooldown = 120, [switch]$Teste)

$ErrorActionPreference = "Stop"
$D = $PSScriptRoot; if (-not $D) { $D = Split-Path -Parent $MyInvocation.MyCommand.Path }
$StF = Join-Path $D "logs\tailscale_watch_state.json"
$TS = (Get-Command tailscale.exe -ErrorAction SilentlyContinue).Source
if (-not $TS) { $TS = "C:\Program Files\Tailscale\tailscale.exe" }

$T = ((Get-Content (Join-Path $D ".env") -ErrorAction SilentlyContinue | Where-Object { $_ -match '^TOKEN=' } | Select-Object -First 1) -split "=", 2)[1].Trim()
$OL = Get-Content (Join-Path $D "src\perm.js") -ErrorAction SilentlyContinue | Where-Object { $_ -match '^const OWNER' } | Select-Object -First 1
$Oid = if ($OL -match '"(.*?)"') { $Matches[1] }
if (-not $T -or -not $Oid) { Write-Output "[ts] TOKEN/OWNER ausente no .env/perm.js"; exit 1 }

$script:Ch = $null
$V = [System.Char]::ConvertFromUtf32(0x1F7E2)
$R = [System.Char]::ConvertFromUtf32(0x1F534)
$K = [System.Char]::ConvertFromUtf32(0x1F511)

function DM([string]$txt) {
  try {
    $h = @{ Authorization = "Bot $T" }
    if (-not $script:Ch) {
      $r = Invoke-RestMethod "https://discord.com/api/v10/users/@me/channels" -Method Post -Headers $h -ContentType "application/json" -Body (@{ recipient_id = $Oid } | ConvertTo-Json)
      $script:Ch = [string]$r.id
    }
    Invoke-RestMethod "https://discord.com/api/v10/channels/$($script:Ch)/messages" -Method Post -Headers $h -ContentType "application/json" -Body (@{ content = $txt } | ConvertTo-Json) | Out-Null
    return $true
  } catch {
    $script:Ch = $null
    Write-Output ("[ts] DM: " + $_.Exception.Message)
    return $false
  }
}

function Status {
  try { $l = & $TS status --json 2>$null; ($l -join "`n") | ConvertFrom-Json } catch { $null }
}

function Nova-Lista($st) {
  $m = @{}
  if ($st.Peer) {
    foreach ($p in $st.Peer.PSObject.Properties) {
      $v = $p.Value
      if ($null -eq $v.InNetworkMap -or $v.InNetworkMap -eq $false) { continue }
      $n = $v.HostName; if (-not $n) { $n = $v.DNSName }
      $m[[string]$v.ID] = @{ n = [string]$n; on = ($v.Online -eq $true) }
    }
  }
  return $m
}

function Load {
  if (Test-Path $StF) {
    try {
      $e = Get-Content $StF -Raw | ConvertFrom-Json
      if (-not $e.peers) { $e.peers = @{} }
      else {
        $h = @{}
        foreach ($p in $e.peers.PSObject.Properties) { $h[$p.Name] = @{ n = $p.Value.n; on = [bool]$p.Value.on; em = $p.Value.em; fora = $p.Value.fora } }
        $e.peers = $h
      }
      $script:Ch = $e.ch
      return $e
    } catch { Write-Output "[ts] estado corrompido; zerando" }
  }
  return [pscustomobject]@{ ch = $null; auth = $null; peers = @{} }
}

function Save($e) {
  try {
    $dir = Split-Path -Parent $StF
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $e.ch = $script:Ch
    Set-Content -Path $StF -Value ($e | ConvertTo-Json -Depth 5) -Encoding UTF8
  } catch { Write-Output ("[ts] save: " + $_.Exception.Message) }
}

Write-Output "[ts] iniciado (poll=$Poll cooldown=$Cooldown)"

do {
  try {
    $st = Status
    if (-not $st) {
      Write-Output ("[{0}] tailscale sem resposta" -f (Get-Date -Format HH:mm:ss))
    }
    elseif ($st.BackendState -ne "Running") {
      $e = Load
      if ($st.AuthURL) {
        $a = $e.auth
        if (-not $a -or ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [int64]$a) -gt ($Cooldown * 1000)) {
          if (DM "$K **Tailscale precisa de login.** Abra: $($st.AuthURL)") { $e.auth = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); Save $e }
        }
      }
      else {
        Write-Output ("[{0}] desconectado; rodando tailscale up" -f (Get-Date -Format HH:mm:ss))
        Start-Process -FilePath $TS -ArgumentList "up" -WindowStyle Hidden
      }
    }
    else {
      $s = Nova-Lista $st
      $e = Load
      $ag = Get-Date
      $mili = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      foreach ($id in $s.Keys) {
        $c = $s[$id]
        if (-not $e.peers.ContainsKey($id)) { $e.peers[$id] = $c; continue }
        $a = $e.peers[$id]
        $mudou = ($a.on -ne $c.on)
        $a.n = $c.n; $a.on = $c.on
        if ($mudou) {
          $k = if ($c.on) { "em" } else { "fora" }
          $ult = $a.$k
          $ok = $true
          if ($ult -and ($mili - [int64]$ult) -lt ($Cooldown * 1000)) { $ok = $false }
          if ($ok) {
            $hora = $ag.ToString("dd/MM/yyyy HH:mm:ss")
            $msg = if ($c.on) { "$V **$($c.n)** ficou **online** as $hora." } else { "$R **$($c.n)** ficou **offline** as $hora." }
            if (DM $msg) { $a.$k = $mili }
          }
        }
      }
      foreach ($id in @($e.peers.Keys)) { if (-not $s.ContainsKey($id)) { $e.peers.Remove($id) } }
      Save $e
    }
  } catch {
    Write-Output ("[{0}] erro: {1}" -f (Get-Date -Format HH:mm:ss), $_.Exception.Message)
  }
  if ($Teste) { break }
  Start-Sleep $Poll
} while ($true)

Write-Output "[ts] encerrado"
