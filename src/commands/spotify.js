const {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
} = require("discord.js");

let tokenCache = { valor: null, expira: 0 };

async function tokenSpotify() {
  if (tokenCache.valor && Date.now() < tokenCache.expira) return tokenCache.valor;
  const r = await fetch(
    "https://open.spotify.com/get_access_token?reason=transport&productType=embed",
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );
  if (!r.ok) throw new Error("sem token anônimo");
  const j = await r.json();
  if (!j.accessToken) throw new Error("token vazio");
  tokenCache = { valor: j.accessToken, expira: Date.now() + (j.expiresIn || 3000) * 900 };
  return tokenCache.valor;
}

async function buscarSpotify(q) {
  const t = await tokenSpotify();
  const r = await fetch(
    "https://api.spotify.com/v1/search?type=track&limit=5&market=BR&q=" + encodeURIComponent(q),
    { headers: { Authorization: "Bearer " + t } }
  );
  if (!r.ok) throw new Error("busca falhou (" + r.status + ")");
  const j = await r.json();
  return (j.tracks?.items || []).map((t2) => ({
    nome: t2.name,
    artistas: t2.artists.map((a) => a.name).join(", "),
    album: t2.album?.name || "",
    durMs: t2.duration_ms,
    url: t2.external_urls?.spotify,
  }));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("spotify")
    .setDescription("Buscar músicas no Spotify")
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel
    )
    .setIntegrationTypes(
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall
    )
    .addStringOption((o) => o.setName("busca").setDescription("Música ou artista").setRequired(true).setMaxLength(200)),

  async execute(interaction) {
    const q = interaction.options.getString("busca", true);
    await interaction.deferReply();
    try {
      const faixas = await buscarSpotify(q);
      if (!faixas.length) throw new Error("nada encontrado");
      const fmt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;
      const lista = faixas
        .map((t, i) => `**${i + 1}.** [${t.nome}](${t.url})\n　🎤 ${t.artistas} · 💿 ${t.album} · ⏱ ${fmt(t.durMs)}`)
        .join("\n\n");
      await interaction.editReply(`🎧 **Top faixas pra "${q}"**\n\n${lista.slice(0, 1900)}`);
    } catch (err) {
      await interaction.editReply(
        `❌ Falhou (${err.message}), mas aqui vai a busca direta:\n🔗 <https://open.spotify.com/search/${encodeURIComponent(q)}>`
      );
    }
  },
};
