const {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
} = require("discord.js");

async function buscarYouTube(q) {
  const url = "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
  });
  const html = await r.text();
  const m = html.match(/var ytInitialData = (\{.+?\});<\/script>/s);
  if (!m) throw new Error("não consegui ler os resultados");
  const dados = JSON.parse(m[1]);
  const itens = [];
  const varre = (obj) => {
    if (!obj || typeof obj !== "object" || itens.length >= 8) return;
    const rend = obj.videoRenderer;
    if (rend && rend.videoId) {
      const titulo = rend.title?.runs?.[0]?.text || "(sem título)";
      const canal = rend.ownerText?.runs?.[0]?.text || rend.longBylineText?.runs?.[0]?.text || "?";
      const dur =rend.lengthText?.simpleText || "";
      const views = rend.shortViewCountText?.simpleText || "";
      if (!itens.some((i) => i.id === rend.videoId)) {
        itens.push({ id: rend.videoId, titulo, canal, dur, views });
      }
    }
    for (const k of Object.keys(obj)) varre(obj[k]);
  };
  varre(dados);
  return itens.slice(0, 5);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("youtube")
    .setDescription("Buscar vídeos no YouTube")
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel
    )
    .setIntegrationTypes(
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall
    )
    .addStringOption((o) => o.setName("busca").setDescription("O que procurar").setRequired(true).setMaxLength(200)),

  async execute(interaction) {
    const q = interaction.options.getString("busca", true);
    await interaction.deferReply();
    try {
      const itens = await buscarYouTube(q);
      if (!itens.length) throw new Error("nada encontrado");
      const lista = itens
        .map((v, i) => `**${i + 1}.** [${v.titulo}](https://youtu.be/${v.id})\n　👤 ${v.canal}${v.dur ? ` ⏱ ${v.dur}` : ""}${v.views ? ` 👁 ${v.views}` : ""}`)
        .join("\n\n");
      await interaction.editReply(`🎬 **Top resultados pra "${q}"**\n\n${lista.slice(0, 1900)}`);
    } catch (err) {
      await interaction.editReply(
        `❌ Falhou (${err.message}), mas aqui vai a busca direta:\n🔗 <https://www.youtube.com/results?search_query=${encodeURIComponent(q)}>`
      );
    }
  },
};
