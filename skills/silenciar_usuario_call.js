const https = require('https');

const API = 'https://discord.com/api/v10';

function req(url, options, body) {
  return new Promise((resolve) => {
    const r = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    r.on('error', (e) => resolve({ status: 0, data: e.message }));
    r.setTimeout(10000, () => { r.destroy(new Error('timeout')); });
    r.write(JSON.stringify(body));
    r.end();
  });
}

module.exports = {
  nome: 'silenciar_usuario_call',
  descricao:
    'Silencia um usuário na call do Discord (mute no servidor) sem ensurdecer. ' +
    'Permite também desmutar (não silenciar) passando unmute/desmutar=true.',
  executar: async (args = {}) => {
    const userId = args.usuarioId || args.userId || args.id || args.usuario || null;
    const guildId = args.guildId || args.guild || args.servidorId || args.servidor || null;

    if (!userId) return '❌ Preciso do ID do usuário para silenciar na call.';
    if (!guildId) return '❌ Preciso do ID do servidor (guild) para silenciar.';

    const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
    if (!token) return '❌ Token do bot não configurado (DISCORD_TOKEN no .env).';

    const desmutar = !!(args.unmute || args.desmutar || args['nao-silenciar'] === true);
    const body = desmutar ? { mute: false, deaf: false } : { mute: true, deaf: false };

    const url = `${API}/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`;
    const res = await req(
      url,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bot ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'NeonBot (node, 1.0.0)',
        },
      },
      body
    );

    if (res.status >= 200 && res.status < 300) {
      return desmutar
        ? `🔊 Usuário \`${userId}\` desmutado na call (não está mais silenciado).`
        : `🔇 Usuário \`${userId}\` silenciado na call (sem ensurdecer).`;
    }
    if (res.status === 404) {
      return `❌ Usuário \`${userId}\` não encontrado no servidor (ou não está numa call).`;
    }
    if (res.status === 403) {
      return '❌ Sem permissão (preciso da permissão "Gerenciar membros"/"Silenciar membros").';
    }
    return `❌ Falha ao alterar silêncio (HTTP ${res.status}): ${res.data}`;
  },
};