const {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
} = require("discord.js");

async function buscarLetra(artista, musica) {
  if (!artista || !artista.trim()) {
    const r = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(musica)}`,
      { headers: { "User-Agent": "Neon/1.0 (Discord bot)" } }
    );
    if (!r.ok) throw new Error("a API falhou (" + r.status + ")");
    const arr = await r.json();
    const hit = (Array.isArray(arr) ? arr : []).find((x) => x && x.plainLyrics);
    if (!hit) throw new Error("não achei essa música");
    return { letra: hit.plainLyrics.trim(), artista: hit.artistName || "?" };
  }
  const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artista)}/${encodeURIComponent(musica)}`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Neon/1.0 (Discord bot)" },
  });
  if (r.status === 404 || r.status === 400) {
    throw new Error("não achei essa música nessa combinação");
  }
  if (!r.ok) throw new Error("a API falhou (" + r.status + ")");
  const j = await r.json();
  const letra = (j.lyrics || "").trim();
  if (!letra) throw new Error("letra vazia");
  return { letra, artista };
}

function dividir(texto, max) {
  const partes = [];
  let atual = "";
  for (const linha of texto.split("\n")) {
    if ((atual + "\n" + linha).trim().length > max && atual) {
      partes.push(atual.trim());
      atual = linha;
    } else {
      atual = atual ? atual + "\n" + linha : linha;
    }
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("letra")
    .setDescription("Buscar a letra de uma música")
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel
    )
    .setIntegrationTypes(
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall
    )
    .addStringOption((o) => o.setName("artista").setDescription("Nome do artista/banda").setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName("musica").setDescription("Nome da música").setRequired(true).setMaxLength(100)),

  async execute(interaction) {
    const artista = interaction.options.getString("artista", true);
    const musica = interaction.options.getString("musica", true);
    await interaction.deferReply();
    try {
      const res = await buscarLetra(artista, musica);
      const artistaUsado = res.artista || artista;
      const cab = `**🎵 ${musica}** — *${artistaUsado}*\n`;
      const partes = dividir(cab + res.letra, 1900);
      await interaction.editReply(partes[0]);
      for (const p of partes.slice(1)) {
        await interaction.followUp(p);
      }
    } catch (err) {
      await interaction.editReply(
        `❌ ${err.message}.\n🔗 Tenta procurar: <https://www.youtube.com/results?search_query=${encodeURIComponent(`${musica} ${artista}`)}>`
      );
    }
  },
};