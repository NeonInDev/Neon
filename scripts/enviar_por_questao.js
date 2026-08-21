const fs = require("fs");

const KEY = fs
  .readFileSync("C:/Users/Pichau/neon/.env", "utf8")
  .split("\n")
  .find((l) => l.startsWith("MASTER_KEY="))
  .split("=")[1]
  .trim();
const BASE = "http://100.115.96.52:3000/api/whatsapp";
const H = { "X-Hud-Key": KEY, "Content-Type": "application/json; charset=utf-8" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(rota, obj) {
  const r = await fetch(`${BASE}/${rota}?key=${encodeURIComponent(KEY)}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(obj),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

function lerTxt(p) {
  return fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n").trim();
}

function montarGeo() {
  const txt = lerTxt("C:/Users/Pichau/estudos/revisao_geografia_global_2tri.txt");
  const soUmaVez = txt.split("Tarefa em sala")[0];
  const msgs = [];
  msgs.push("*REVISAO GEOGRAFIA QUESTOES*\n_8º ano — Global 2º trimestre_");
  msgs.push("*PARTE 1 — AMÉRICA CENTRAL: ASPECTOS NATURAIS E SOCIOCULTURAIS*");
  const pedacos = soUmaVez.split(/\n(?=Questão \d+\.)/);
  for (let p of pedacos) {
    p = p.trim();
    if (!p) continue;
    if (/^Conteúdo/.test(p) || /^Revisão$/.test(p)) continue;
    const m = p.match(/^(Questão (\d+)\.)/);
    if (m) {
      if (m[2] === "6") msgs.push("*PARTE 2 — AMÉRICA CENTRAL: ATIVIDADES ECONÔMICAS, TENSÕES SOCIAIS E GEOPOLÍTICA*");
      const resto = p.slice(m[1].length).trim();
      msgs.push(`*QUESTÃO ${m[2]}*\n${resto}`);
    } else {
      if (!msgs[1] && /Parte 1/.test(p)) continue;
    }
  }
  const idxGab = soUmaVez.indexOf("Gabarito");
  if (idxGab !== -1) {
    const gab = soUmaVez.slice(idxGab + "Gabarito".length).trim();
    const itens = gab.split(/\n(?=\d+\. Questão \d+:)/);
    for (const it of itens) {
      const mm = it.match(/^(\d+)\. Questão (\d+):\s*([\s\S]*)/);
      if (mm) msgs.push(`*GABARITO — QUESTÃO ${mm[2]}*\n${mm[3].trim()}`);
    }
  }
  return msgs;
}

function montarIngles() {
  let txt = lerTxt("C:/Users/Pichau/estudos/revisao_ingles_global_2tri.txt");
  txt = txt.replace(/&ndash;/g, "-").replace(/&amp;/g, "&");
  txt = txt.replace(/^ês\n/);
  const idxGab = txt.indexOf("Gabarito");
  const questoesParte = txt.slice(0, idxGab).trim();
  const gabarito = txt.slice(idxGab + "Gabarito".length).trim();

  const msgs = [];
  msgs.push("*REVISAO INGLES QUESTOES*\n_8º ano — Global 2º trimestre_");

  const linhas = questoesParte.split("\n");
  const blocos = [];
  let atual = { titulo: null, conteudo: [] };
  for (const ln of linhas) {
    if (/^Part \d+\s*-/.test(ln.trim())) {
      if (atual.titulo || atual.conteudo.length) blocos.push(atual);
      atual = { titulo: ln.trim(), conteudo: [] };
    } else {
      atual.conteudo.push(ln);
    }
  }
  if (atual.titulo || atual.conteudo.length) blocos.push(atual);

  const marcadoresContexto = [
    "Read the advertisement:",
    "NEW ENERGY DRINK!",
    "NEW SMART WATCH",
    "Read the text:",
    "Future City Project",
    "Healthy Juice Advertisement",
    "Redução de Slogan/Advertisement",
    "Substitua as questões anteriores de slogan por:",
  ];

  const numera = /\n(?=\d+\)\s)/;
  for (const b of blocos) {
    if (b.titulo) msgs.push(`*${b.titulo.replace(/^Part (\d+)/, "PART $1").toUpperCase()}*`);
    let corpo = b.conteudo.join("\n").trim();
    if (!corpo) continue;
    const partes = corpo.split(numera).filter((p) => p.trim());
    let pendenteCtx = [];
    for (const p of partes) {
      const linhasP = p.split("\n");
      while (linhasP.length && marcadoresContexto.some((mk) => linhasP[linhasP.length - 1].trim().startsWith(mk))) {
        pendenteCtx.unshift(linhasP.pop());
      }
      if (pendenteCtx.length && /^\d+\)/.test(linhasP[0] || "")) {
        linhasP.unshift(...pendenteCtx.splice(0));
      }
      msgs.push(linhasP.join("\n").trim());
    }
  }

  if (gabarito) msgs.push(`*GABARITO*\n${gabarito}`);
  return msgs;
}

(async () => {
  const geo = montarGeo();
  const ing = montarIngles();
  console.log(`mensagens: geo=${geo.length} ingles=${ing.length}`);

  console.log("conectando...");
  let ok = false;
  for (let i = 0; i < 12; i++) {
    await sleep(8000);
    try {
      const s = await fetch(`${BASE}/status?key=${encodeURIComponent(KEY)}`, { headers: H });
      const sj = await s.json();
      if (sj.conectado) { ok = true; break; }
    } catch {}
  }
  if (!ok) { console.error("nao conectou"); process.exit(1); }
  await sleep(6000);
  await post("fechar_modais", {});

  const grau = String.fromCharCode(186);
  const abriu = await post("abrir_conversa", { termo: `8${grau}D` });
  console.log("abrir:", JSON.stringify(abriu.j));
  if (!abriu.j.ok) { console.error("falhou abrir conversa"); process.exit(1); }
  await sleep(2000);

  let falhas = 0;
  const todas = [
    ...geo.map((t) => ({ disc: "GEO", t })),
    ...ing.map((t) => ({ disc: "ING", t })),
  ];
  for (let i = 0; i < todas.length; i++) {
    const { disc, t } = todas[i];
    const r = await post("enviar_ui", { texto: t });
    const bom = r.status === 200 && r.j.ok;
    if (!bom) falhas++;
    console.log(`[${i + 1}/${todas.length}] ${disc} ${bom ? "ok" : "FALHOU " + JSON.stringify(r.j).slice(0, 120)} | ${t.slice(0, 50).replace(/\n/g, " ")}`);
    await sleep(2500);
  }
  console.log(`FIM. falhas=${falhas}`);
})();
