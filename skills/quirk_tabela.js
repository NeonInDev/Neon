const fs = require('fs');
const path = require('path');

function dataPath() {
  return path.join(__dirname, '..', 'data', 'quirks.json');
}

function carregarDados() {
  const caminho = dataPath();
  if (!fs.existsSync(caminho)) return null;
  const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  return Array.isArray(dados?.quirks) ? dados.quirks : [];
}

function normalizar(txt) {
  return String(txt || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

function buscar(entrada, quirks) {
  const alvo = normalizar(entrada).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!alvo) return null;

  let melhor = null;
  let melhorScore = 0;
  for (const q of quirks) {
    const nomes = [q.nome, q.id, ...(Array.isArray(q.alias) ? q.alias : [])].map(normalizar);
    for (const n of nomes) {
      const score = n === alvo ? 100 : (n.startsWith(alvo) ? 80 : n.includes(alvo) ? 60 : 0);
      if (score > melhorScore) { melhorScore = score; melhor = q; }
    }
  }
  return melhor;
}

function formatar(q) {
  const linhas = [
    `> # __${q.nome}__ ⎯ **${q.tipo}**`,
    q.alias?.length ? `> *Aliases:* ${q.alias.join(', ')}` : '',
    '',
    q.resumo,
  ].filter(Boolean);
  return linhas.join('\n');
}

module.exports = {
  nome: 'quirk_tabela',
  descricao: 'Consulta a métrica/tabela oficial de uma quirk do servidor BNHA/NEW GENESIS pelo nome. Uso: skill_quirk_tabela | [nome da quirk | listar]',
  executar: async (args) => {
    const quirks = carregarDados();
    if (!quirks) return '❌ Banco de quirks não encontrado (data/quirks.json).';

    if (typeof args === 'string') args = args.trim();

    if (typeof args === 'string' && /^(listar|lista|todas|todos|nomes|index)$/i.test(args)) {
      return '📚 **Quirks disponíveis na métrica da Neon:**\n' +
        quirks.map((q) => `- ${q.nome} (${q.tipo})`).join('\n');
    }

    let nome;
    if (typeof args === 'string') {
      nome = args;
    } else if (args && typeof args === 'object') {
      nome = args.nome || args.quirk || args.busca;
    }

    const q = buscar(nome, quirks);
    if (!q) return `❌ Quirk \`${nome}\` não encontrada na métrica da Neon. Tente \`skill_quirk_tabela | listar\` para ver todas.`;

    return formatar(q);
  }
};