module.exports = {
  nome: 'tirar_haru',
  descricao: 'Remove o Haru da casa com estilo (ban kick simulation)',
  executar: async (args) => {
    const frases = [
      '🚪 A porta se abriu com força...',
      '💨 O vento soprou forte no corredor!',
      '🦶 Um chute voador mandou o Haru pra fora!',
      '🧳 A mala do Haru já estava pronta na calçada.',
      '🔒 Trancando a porta... chave girando...',
      '👋 "Tchau, Haru! Volta nunca mais!"',
      '🏠 A casa respirou aliviada.',
      '🚶‍♂️ Haru foi escoltado até o portão com honras.',
      '🚔 O Über do Haru chegou. Destino: longe daqui.',
      '🌀 Haru foi sugado por um portal dimensional!',
      '💣 "Essa casa tem dono, Haru!" *explosão dramática*',
      '🧹 A casa limpou os vestígios do Haru em 0.3s.',
    ];

    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    let resultado = '═══════════════════════════════\n';
    resultado += '   🏠 OPERAÇÃO: TIRAR O HARU\n';
    resultado += '═══════════════════════════════\n\n';

    for (const frase of frases) {
      resultado += frase + '\n';
      await delay(150);
    }

    resultado += '\n═══════════════════════════════\n';
    resultado += '✅ HARU REMOVIDO COM SUCESSO!\n';
    resultado += '🏠 A casa está livre novamente.\n';
    resultado += '═══════════════════════════════\n';

    return resultado;
  }
};