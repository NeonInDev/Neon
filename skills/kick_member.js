const https = require('https');
const fs = require('fs');
const path = require('path');

function getToken() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  const env = fs.readFileSync(envPath, 'utf8');
  const match = env.match(/DISCORD_BOT_TOKEN\s*=\s*(.+)/);
  if (!match) throw new Error('Token do Discord não encontrado no .env');
  return match[1].trim();
}

function getGuildId() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  const env = fs.readFileSync(envPath, 'utf8');
  const match = env.match(/DISCORD_GUILD_ID\s*=\s*(.+)/);
  return match ? match[1].trim() : null;
}

function request(method, urlPath, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'discord.com',
      path: urlPath,
      method: method,
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'NeonBot/1.0'
      }
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(opts, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let json;
        try { json = JSON.parse(raw); } catch { json = raw; }
        resolve({ status: res.statusCode, data: json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

module.exports = {
  nome: 'kick-member',
  descricao: 'Remove um membro de um servidor Discord pelo ID (não silencia, só expulsa)',
  executar: async (args) => {
    let userId, guildId, motivo;
    if (typeof args === 'string' && args.trim()) {
      userId = args.trim().match(/\d{15,21}/)?.[0] || args.trim();
    } else if (args && typeof args === 'object') {
      userId = args.userId || args.usuario || args.id;
      guildId = args.guildId || args.server;
      motivo = args.motivo || args.reason;
    }
    userId = String(userId || '').replace(/\D/g, '');
    if (!userId) return '❌ Informe o ID do membro para expulsar. Ex: executar({ userId: "1448148569117692064" })';

    guildId = guildId || getGuildId();
    if (!guildId) return '❌ Informe o ID do servidor (guild). Ex: executar({ userId: "...", guildId: "..." })';

    const token = getToken();
    const reason = motivo || 'Expulso por Neon';

    const res = await request(
      'DELETE',
      `/api/v10/guilds/${guildId}/members/${userId}?reason=${encodeURIComponent(reason)}`,
      token
    );

    if (res.status === 204 || res.status === 200) {
      return `✅ Membro \`${userId}\` removido do servidor com sucesso! Motivo: ${reason}`;
    }

    if (res.status === 403) return '❌ Sem permissão — preciso da permissão **KICK_MEMBERS** no servidor.';
    if (res.status === 404) return `❌ Membro \`${userId}\` não encontrado no servidor.`;
    if (res.status === 401) return '❌ Token do bot inválido ou ausente no .env.';

    return `⚠️ Erro HTTP ${res.status}: ${JSON.stringify(res.data)}`;
  }
};