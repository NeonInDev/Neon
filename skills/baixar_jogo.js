// Skill "baixar_jogo" - baixa/instala um jogo pra/ com o dono.
// Fluxo: primeiro procura na Steam (busca AppID). Se achar, instala via
// steam://install/<id>. Se NÃO achar na Steam, abre o Hydra Launcher e
// orienta o download manual (GUI).

const pc = require("../src/pc.js");

async function executar(args) {
  const nome = String(args || "").trim();
  if (!nome || nome.length < 2) {
    return "❌ Uso: skill_baixar_jogo | [nome do jogo] (ex: 'Hollow Knight: Silksong')";
  }

  try {
    const busca = await pc.buscarJogoSteam(nome);
    if (busca.ok && busca.appid) {
      const inst = await pc.instalarJogoSteam(busca.appid);
      return [
        `🎮 **Achei "${busca.nome}" na Steam!** (AppID ${busca.appid})`,
        `💰 Preço: ${busca.preco}`,
        `📥 ${inst.ok ? "Instalação iniciada na Steam." : "Falha ao iniciar a instalação."}`,
        `Instalando via Steam...`,
      ].join("\n");
    }

    // Não achou na Steam -> cai pro Hydra
    await pc.abrirAppPorNome("hydra");
    return [
      `❓ Não encontrei "${nome}" na Steam (${busca.erro || "sem resultados"}).`,
      `🚀 Abri o **Hydra Launcher** pra você.`,
      `Busca lá por "${nome}" e clica pra baixar/instalar — aí você me avisa que eu te ajudo no resto. 😈`,
    ].join("\n");
  } catch (err) {
    return `❌ Erro na skill baixar_jogo: ${err.message?.slice(0, 200)}`;
  }
}

module.exports = {
  nome: "baixar_jogo",
  descricao: `Baixa/instala um jogo. Primeiro procura na Steam (e instala se achar); se não tiver, abre o Hydra. Uso: skill_baixar_jogo | [nome do jogo]`,
  executar,
};
