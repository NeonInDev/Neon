// Conta mensagens com link de servidor que NAO foram repetidas dentro de N dias.
//
// Regra: uma mensagem conta se o mesmo link nao apareceu nos N dias anteriores.
// Se o link voltou dentro da janela, e repeticao e nao entra na contagem. O que
// sobra e o numero de postagens de parceria de verdade no canal.
//
//   node scripts/contar_parcerias.js [canalId] [dias]
//
// A janela e argumento (ou a env JANELA_DIAS) porque o prazo que faz sentido
// depende do dia: 7 dias separa uma divulgacao de um reenvio, 3 dias separa
// um reenvio rapido de divulgacao. Com 1 dia quase nada conta, porque quem
// posta todo dia aparece como repeticao.
//
// So leitura: nao escreve nada, nao pune ninguem.

require("dotenv").config();

const TOKEN = process.env.TOKEN;
const CANAL_PADRAO = process.env.PARCERIAS_CANAL_ID;
const DIAS_JANELA = Number(process.argv[3] || process.env.JANELA_DIAS || 7) || 7;
const LIMITE = 100;

// codigo do invite: discord.gg/abc, discord.com/invite/abc, ptb/canary tambem.
// O protocolo e opcional de proposito: o pessoal cola o link cru ("discord.gg/abc")
// sem https, e com o esquema obrigatorio esse link passava batido na contagem.
// O charset inclui "-" e "_" porque o Discord usa os dois no codigo do invite;
// sem o "_" o codigo era cortado pela metade e contava como link diferente.
const RE_INVITE = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite|discord\.gg|discord\.me|discordapp\.com\/invite)\/([A-Za-z0-9_-]{2,50})/gi;

function extrairLinks(texto) {
  const achados = new Set();
  for (const m of String(texto || "").matchAll(RE_INVITE)) {
    // codigo e case-insensitive no Discord; normaliza pra nao contar
    // "AbC" e "abc" como dois links diferentes
    achados.add(m[1].toLowerCase());
  }
  return [...achados];
}

async function api(caminho, tentativa = 1) {
  const r = await fetch(`https://discord.com/api/v10${caminho}`, {
    headers: { Authorization: `Bot ${TOKEN}` },
  });
  if (r.status === 429) {
    const corpo = await r.json().catch(() => ({}));
    const espera = Math.ceil((corpo.retry_after || 2) * 1000) + 200;
    process.stdout.write(`   (rate limit, esperando ${Math.round(espera / 1000)}s)\n`);
    await new Promise((s) => setTimeout(s, espera));
    return api(caminho, tentativa);
  }
  if (!r.ok) {
    const texto = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status} em ${caminho}: ${texto.slice(0, 200)}`);
  }
  return r.json();
}

async function buscarTudo(canalId) {
  const todas = [];
  let antes = null;
  let pagina = 0;

  for (;;) {
    const q = antes
      ? `/channels/${canalId}/messages?limit=${LIMITE}&before=${antes}`
      : `/channels/${canalId}/messages?limit=${LIMITE}`;
    const lote = await api(q);
    if (!Array.isArray(lote) || !lote.length) break;

    todas.push(...lote);
    pagina += 1;
    process.stdout.write(`   pagina ${pagina}: ${lote.length} mensagens (total ${todas.length})\n`);

    antes = lote[lote.length - 1].id;
    if (lote.length < LIMITE) break;
  }
  return todas;
}

function contar(mensagens) {
  const comLink = [];
  for (const m of mensagens) {
    const links = extrairLinks(m.content);
    if (links.length) comLink.push({ id: m.id, ts: Date.parse(m.timestamp), autor: m.author?.username || "?", links });
  }
  comLink.sort((a, b) => a.ts - b.ts);

  const ultimaVez = new Map(); // link -> timestamp da ultima contagem valida
  const validas = [];
  const repetidas = [];

  for (const m of comLink) {
    for (const link of m.links) {
      const anterior = ultimaVez.get(link);
      const dentroDaJanela = anterior !== undefined && m.ts - anterior < DIAS_JANELA * 86400000;
      if (dentroDaJanela) {
        repetidas.push({ ...m, link, diasDesde: ((m.ts - anterior) / 86400000).toFixed(2) });
      } else {
        validas.push({ ...m, link, diasDesde: anterior === undefined ? null : ((m.ts - anterior) / 86400000).toFixed(2) });
        ultimaVez.set(link, m.ts);
      }
    }
  }
  return { comLink, validas, repetidas };
}

(async () => {
  const canalId = process.argv[2] || CANAL_PADRAO;
  if (!TOKEN) { console.error("TOKEN ausente no .env"); process.exit(1); }
  if (!canalId) { console.error("Informe o canalId"); process.exit(1); }

  console.log(`Buscando todo o historico do canal ${canalId}...`);
  const mensagens = await buscarTudo(canalId);
  console.log(`\nHistorico: ${mensagens.length} mensagens`);

  const { comLink, validas, repetidas } = contar(mensagens);
  const linksUnicos = new Set(comLink.map((m) => m.links).flat());

  console.log("\n=== RESULTADO ===");
  console.log(`Mensagens com link de servidor : ${comLink.length}`);
  console.log(`Mensagens que CONTAM (link sem repeticao em ${DIAS_JANELA}d): ${validas.length}`);
  console.log(`Repeticoes dentro de ${DIAS_JANELA} dias (nao contam)   : ${repetidas.length}`);
  console.log(`Links de servidor distintos   : ${linksUnicos.size}`);

  if (validas.length) {
    console.log("\n--- mensagens que contam ---");
    for (const v of validas) {
      const quando = new Date(v.ts).toISOString().slice(0, 10);
      const volta = v.diasDesde === null ? "1a vez" : `repetido apos ${v.diasDesde}d`;
      console.log(`  ${quando}  ${v.autor.padEnd(18)} ${v.link}  (${volta})`);
    }
  }

  if (repetidas.length) {
    console.log("\n--- repeticoes dentro da janela ---");
    for (const r of repetidas) {
      const quando = new Date(r.ts).toISOString().slice(0, 10);
      console.log(`  ${quando}  ${r.autor.padEnd(18)} ${r.link}  (${r.diasDesde}d depois)`);
    }
  }

  // por autor: quem postou link novo de verdade e quem so repete
  const porAutor = new Map();
  const entrada = (autor) => {
    if (!porAutor.has(autor)) porAutor.set(autor, { autor, conta: 0, repete: 0, links: new Set() });
    return porAutor.get(autor);
  };
  for (const v of validas) {
    const e = entrada(v.autor);
    e.conta += 1;
    e.links.add(v.link);
  }
  for (const r of repetidas) entrada(r.autor).repete += 1;

  console.log("\n--- por autor (conta = link novo em 7d | repete = repetido dentro de 7d) ---");
  const linhas = [...porAutor.values()]
    .map((e) => ({ ...e, total: e.conta + e.repete, distintos: e.links.size }))
    .sort((a, b) => b.conta - a.conta || b.total - a.total);
  for (const e of linhas) {
    const pct = e.total ? Math.round((e.repete / e.total) * 100) : 0;
    console.log(
      `  ${e.autor.padEnd(20)} conta=${String(e.conta).padStart(3)}  repete=${String(e.repete).padStart(3)}  ` +
      `(${String(pct).padStart(3)}% repete)  total=${e.total}  links_distintos=${e.distintos}`
    );
  }
})().catch((err) => {
  console.error("\nERRO:", err.message);
  process.exit(1);
});
