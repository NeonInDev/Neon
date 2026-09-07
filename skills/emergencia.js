// Skill "emergencia" - PROTOCOLO DE EMERGÊNCIA da Neon.
// Fecha todos os apps que estão consumindo mais de 1 GB de RAM somada
// (soma todos os processos do mesmo app, ex.: Opera com vários filhos).
// JOGOS instalados (por caminho) e launchers (Steam/Riot/Epic/GOG) são IGNORADOS.
// Por segurança, "fechar" primeiro MOSTRA o que será fechado e pede "fechar confirmar".
//
// Uso:
//   skill_emergencia | checar            → lista os apps > 1 GB (sem fechar)
//   skill_emergencia | fechar            → mostra o que seria fechado e pede confirmação
//   skill_emergencia | fechar confirmar  → fecha de verdade todos os apps > 1 GB
//   skill_emergencia | fechar 1500       → mostra apps com > 1500 MB somados
//   skill_emergencia | fechar 1500 confirmar → fecha os apps com > 1500 MB
//   skill_emergencia | limitar 2000      → troca o limite padrão (ex.: 2 GB)

const { execFile } = require("child_process");
const { readFileSync, writeFileSync, mkdirSync } = require("fs");
const { join, dirname } = require("path");

const ROOT = __dirname.replace(/[/\\]skills$/, "");
const ARQ = join(ROOT, "data", "emergencia.json");
const TMP_PS1 = join(ROOT, "data", "_emergencia_proc.ps1");
const LIMITE_PADRAO_MB = 1024;

const SCRIPT_LISTA = `
$Erro = $null
try {
  $ignorar = @($IGNORAR_LISTA)
  $launchers = @('steam','steamwebhelper','steamservice','steamerrorreporter','RiotClientServices','RiotClientCrashHandler','RiotClientUx','LeagueClient','LeagueClientUx','LeagueCrashHandler','EpicGamesLauncher','GOGGalaxy','GameOverlayUI','Battle.net','RobloxPlayerBeta','RobloxCrashHandler')
  $dirJogos = @()
  foreach ($raiz in @('C:\\Program Files (x86)\\Steam','C:\\Program Files\\Steam','D:\\SteamLibrary','D:\\Steam','E:\\SteamLibrary')) {
    $common = Join-Path $raiz 'steamapps\\common'
    if (Test-Path $common) { Get-ChildItem $common -Directory -ErrorAction SilentlyContinue | ForEach-Object { $dirJogos += $_.FullName.ToLower() } }
  }
  foreach ($d in @('C:\\Riot Games','D:\\Riot Games','C:\\Program Files\\Epic Games','D:\\Epic Games','C:\\GOG Games','C:\\GOG Galaxy\\Games')) {
    if (Test-Path $d) { $dirJogos += $d.ToLower() }
  }
  $sessao = (Get-Process -Id $PID).SessionId
  $procs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -notin $ignorar -and $_.Name -notin $launchers -and $_.SessionId -eq $sessao
  })
  $jogoIds = @{}
  foreach ($p in $procs) {
    try {
      $cam = $p.Path
      if (-not $cam) { $cam = $p.MainModule.FileName }
    } catch { $cam = $null }
    if ($cam) {
      $lc = $cam.ToLower()
      foreach ($j in $dirJogos) {
        if ($lc.StartsWith($j)) { $jogoIds[$p.Id] = $true; break }
      }
    }
  }
  $procs = @($procs | Where-Object { -not $jogoIds.ContainsKey($_.Id) })
  $grupos = $procs | Group-Object Name | ForEach-Object {
    $soma = [math]::Round(($_.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB)
    [PSCustomObject]@{ nome = $_.Name; totalMb = $soma; cont = $_.Count; ids = (($_.Group | ForEach-Object { $_.Id }) -join ',') }
  } | Where-Object { $_.totalMb -gt $LimiteMb } | Sort-Object totalMb -Descending
  foreach ($g in $grupos) {
    Write-Output ("{0}|{1}|{2}|{3}" -f $g.nome, $g.totalMb, $g.cont, $g.ids)
  }
} catch { $Erro = $_.Exception.Message }
if ($Erro) { Write-Output ("ERRO|" + $Erro) }
`;

const SCRIPT_MATA = `
$Erro = $null
$resultados = @()
try {
  $ids = @($Ids -split ',')
  foreach ($id in $ids) {
    $p = Get-Process -Id ([int]$id) -ErrorAction SilentlyContinue
    if ($p) {
      try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; $resultados += "OK|$($p.Name)" }
      catch { $resultados += "FAIL|$($p.Name)|$($_.Exception.Message)" }
    }
  }
} catch { $Erro = $_.Exception.Message }
foreach ($r in $resultados) { Write-Output $r }
if ($Erro) { Write-Output ("ERRO|" + $Erro) }
`;

function rodarPs1(script, parametros) {
  return new Promise((resolve) => {
    try {
      writeFileSync(TMP_PS1, script, "utf8");
    } catch (e) {
      return resolve({ ok: false, out: "", erro: e.message });
    }
    const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", TMP_PS1];
    execFile("powershell.exe", args.concat(parametros || []), { windowsHide: true, timeout: 25000, maxBuffer: 1500000, cwd: ROOT }, (err, stdout) => {
      const out = (stdout || "").trim();
      const erro = err && !out.includes("ERRO|") ? err.message : "";
      resolve({ ok: !erro, out, erro });
    });
  });
}

function carregarLimite() {
  try {
    const { limiteMb } = JSON.parse(readFileSync(ARQ, "utf8"));
    return limiteMb || LIMITE_PADRAO_MB;
  } catch {
    return LIMITE_PADRAO_MB;
  }
}

function salvarLimite(limiteMb) {
  mkdirSync(dirname(ARQ), { recursive: true });
  writeFileSync(ARQ, JSON.stringify({ limiteMb }, null, 2), "utf8");
}

async function listarPesados(limiteMb) {
  const ignorar = ",'Idle','System','explorer','dwm','csrss','winlogon','services','svchost','conhost','fontdrvhost','Registry','Memory Compression','opencode','Compressed Memory','Secure System'";
  const script = SCRIPT_LISTA.replace(/\$IGNORAR_LISTA/, ignorar).replace(/\$LimiteMb/g, String(limiteMb));
  const r = await rodarPs1(script);
  const out = r.ok ? r.out : r.out + (r.erro ? `\nERRO|${r.erro}` : "");
  if (!out) return { ok: true, procs: [] };
  const erros = out.split(/\r?\n/).filter((l) => l.startsWith("ERRO|"));
  if (erros.length) return { ok: false, erro: erros.join("; ") };
  const procs = out.split(/\r?\n/).filter((l) => l.includes("|")).map((l) => {
    const [nome, mb, cont, ids] = l.split("|");
    return { nome, mb: parseFloat(mb), n: parseInt(cont, 10), ids };
  });
  return { ok: true, procs };
}

function previsaoDeFechamento(r, limiteMb) {
  if (!r.ok) return `❌ Falha ao listar: ${r.erro}`;
  if (!r.procs.length) return `✅ Nenhum app acima de **${limiteMb} MB** agora. Tudo tranquilo.`;
  const total = r.procs.reduce((acc, p) => acc + p.mb, 0);
  return [
    `⚠️ **CONFIRMAÇÃO — PROTOCOLO DE EMERGÊNCIA** ⚠️`,
    `**Limite:** apps com mais de **${limiteMb} MB** de RAM somada.`,
    ``,
    `**Isto será FECHADO (${r.procs.length}):**`,
    ...r.procs.map((p) => `• **${p.nome}** — ${p.mb} MB (${p.n} procs)`),
    ``,
    `💾 Liberaria ~**${total} MB**.`,
    ``,
    `✅ Confirma? É só me dizer: \`skill_emergencia | fechar confirmar\`${limiteMb !== carregarLimite() ? ` (ou \`skill_emergencia | fechar ${limiteMb} confirmar\`)` : ""}`,
  ].join("\n");
}

async function fecharPesadosReal(limiteMb) {
  const r = await listarPesados(limiteMb);
  if (!r.ok) return `❌ Falha ao listar: ${r.erro}`;
  if (!r.procs.length) return `✅ Nenhum app acima de **${limiteMb} MB** agora. Tudo tranquilo.`;

  const fechados = [];
  const falhas = [];
  let totalLiberado = 0;
  for (const g of r.procs) {
    const k = await rodarPs1(SCRIPT_MATA.replace(/\$Ids/g, g.ids));
    const linhas = k.ok ? k.out : "";
    const oks = linhas.split(/\r?\n/).filter((l) => l.startsWith("OK|")).map((l) => l.replace("OK|", ""));
    const fails = linhas.split(/\r?\n/).filter((l) => l.startsWith("FAIL|")).map((l) => l.replace("FAIL|", ""));
    if (oks.length) { fechados.push(`**${g.nome}** (${g.mb} MB · ${g.n} processos)`); totalLiberado += g.mb; }
    if (fails.length) falhas.push(`**${g.nome}** (${g.mb} MB)`);
  }

  return [
    `🚨 **PROTOCOLO DE EMERGÊNCIA EXECUTADO** 🚨`,
    `**Limite:** apps com mais de **${limiteMb} MB** de RAM somada.`,
    ``,
    `**Fechados (${fechados.length}):**`,
    ...fechados.map((f) => `• ${f}`),
    ``,
    ...(falhas.length ? [`**Não consegui derrubar:**`, ...falhas.map((f) => `⚠️ • ${f}`), ``] : []),
    `💾 Memória liberada: **~${totalLiberado} MB**. 👊`,
  ].join("\n");
}

async function executar(args) {
  const pedido = String(args || "").toLowerCase().trim();
  const limiteAtual = carregarLimite();

  if (!pedido || ["checar", "check", "lista", "listar"].includes(pedido)) {
    const r = await listarPesados(limiteAtual);
    if (!r.ok) return `❌ ${r.erro}`;
    if (!r.procs.length) return `✅ Nenhum app acima de **${limiteAtual} MB** agora.`;
    return [
      `🔍 **Apps usando mais de ${limiteAtual} MB de RAM (somada):**`,
      ``,
      ...r.procs.map((p, i) => `${i + 1}. **${p.nome}** — ${p.mb} MB (${p.n} procs)`),
      ``,
      `Pra fechar: \`skill_emergencia | fechar\` (sempre pede confirmação antes).`,
    ].join("\n");
  }

  if (pedido === "fechar" || pedido === "fechar confirmar") {
    if (pedido === "fechar confirmar") return fecharPesadosReal(limiteAtual);
    return previsaoDeFechamento(await listarPesados(limiteAtual), limiteAtual);
  }

  const fecharComLimite = pedido.match(/^fechar\s+(\d+)(?:\s+confirmar)?$/) || pedido.match(/^fechar\s+(\d+)$/);
  if (fecharComLimite) {
    const lim = parseInt(fecharComLimite[1], 10);
    if (pedido.includes("confirmar")) return fecharPesadosReal(lim);
    return previsaoDeFechamento(await listarPesados(lim), lim);
  }

  const limitar = pedido.match(/^limitar\s+(\d+)$/);
  if (limitar) {
    const lim = parseInt(limitar[1], 10);
    salvarLimite(lim);
    return `🔧 Limite de emergência definido para **${lim} MB**. Vale pro próximo \`checar\`/\`fechar\`.`;
  }

  return "❌ Uso: `checar`, `fechar`, `fechar confirmar`, `fechar <MB>`, `fechar <MB> confirmar`, `limitar <MB>`.";
}

module.exports = {
  nome: "emergencia",
  descricao: `PROTOCOLO DE EMERGÊNCIA: mostra/fecha todos os apps usando mais de 1 GB de RAM (soma processos do mesmo app), IGNORANDO jogos instalados e launchers de jogo (Steam/Riot/Epic/GOG). "fechar" sempre avisa antes o que será fechado e pede "fechar confirmar". Uso: skill_emergencia | [checar | fechar | fechar confirmar | fechar <MB> | fechar <MB> confirmar | limitar <MB>]`,
  executar,
};