// Skill "emergencia" - PROTOCOLO DE EMERGÊNCIA da Neon.
// Fecha todos os apps que estão consumindo mais de 1 GB de RAM somada
// (soma todos os processos do mesmo app, ex.: Opera com vários filhos).
//
// Uso:
//   skill_emergencia | checar        → lista os apps > 1 GB (sem fechar)
//   skill_emergencia | fechar        → fecha todos os apps > 1 GB
//   skill_emergencia | fechar 1500   → fecha apps com > 1500 MB somados
//   skill_emergencia | limitar 2000  → troca o limite padrão (ex.: 2 GB)

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
  $sessao = (Get-Process -Id $PID).SessionId
  $procs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -notin $ignorar -and $_.SessionId -eq $sessao
  })
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

async function fecharPesados(limiteMb) {
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
      `Pra fechar: \`skill_emergencia | fechar\``,
    ].join("\n");
  }

  if (pedido === "fechar") return fecharPesados(limiteAtual);

  const fecharComLimite = pedido.match(/^fechar\s+(\d+)$/);
  if (fecharComLimite) return fecharPesados(parseInt(fecharComLimite[1], 10));

  const limitar = pedido.match(/^limitar\s+(\d+)$/);
  if (limitar) {
    const lim = parseInt(limitar[1], 10);
    salvarLimite(lim);
    return `🔧 Limite de emergência definido para **${lim} MB**. Vale pro próximo \`checar\`/\`fechar\`.`;
  }

  return "❌ Uso: `checar`, `fechar`, `fechar <limite em MB>`, `limitar <limite em MB>`.";
}

module.exports = {
  nome: "emergencia",
  descricao: `PROTOCOLO DE EMERGÊNCIA: fecha todos os apps usando mais de 1 GB de RAM (limite configurável, soma os processos do mesmo app). Uso: skill_emergencia | [checar | fechar | fechar <MB> | limitar <MB>]`,
  executar,
};