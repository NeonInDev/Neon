// =============================================================
// VARREDURA
// -------------------------------------------------------------
// Apaga mensagens de um ou mais usuários em um canal do Discord.
//
// - quantidade: número máximo a apagar, da mais recente pra mais
//   antiga. null = todas.
// - O Discord só aceita apagar em lote mensagens com menos de 14
//   dias; as mais velhas vão uma por uma.
// =============================================================

const LIMITE_MS = 14 * 24 * 60 * 60 * 1000;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function varrer(canal, alvos, quantidade = null) {
  const alvosSet = new Set(alvos.map(String));
  let achadas = [];
  let antes = null;

  for (;;) {
    let page;
    try {
      page = await canal.messages.fetch({ limit: 100, before: antes, cache: false });
    } catch {
      break;
    }
    const lote = [...page.values()];
    if (!lote.length) break;
    for (const m of lote) if (alvosSet.has(m.author?.id)) achadas.push(m);
    antes = lote[lote.length - 1].id;
    if (lote.length < 100) break;
    await dormir(400);
  }

  const total = achadas.length;
  if (quantidade != null && quantidade > 0) achadas = achadas.slice(0, quantidade);
  achadas = achadas.filter((m) => m.deletable !== false);

  const velhas = achadas.filter((m) => Date.now() - m.createdTimestamp > LIMITE_MS);
  const novas = achadas.filter((m) => Date.now() - m.createdTimestamp <= LIMITE_MS);
  let apagadas = 0;

  for (let i = 0; i < novas.length; i += 100) {
    const pedaco = novas.slice(i, i + 100);
    try {
      const ok = await canal.bulkDelete(pedaco, true);
      apagadas += ok && ok.size ? ok.size : 0;
    } catch {
      // se o lote falhar, vai uma por uma
      for (const m of pedaco) {
        try { await m.delete(); apagadas++; } catch {}
        await dormir(200);
      }
    }
    await dormir(700);
  }

  for (const m of velhas) {
    try { await m.delete(); apagadas++; } catch {}
    await dormir(250);
  }

  return { total, apagadas };
}

module.exports = { varrer };