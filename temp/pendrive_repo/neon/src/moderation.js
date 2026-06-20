function estaNaBlacklist(db, userId) {
  if (!db.data.blacklist) db.data.blacklist = [];
  return db.data.blacklist.includes(userId);
}

function detectarManipulacao(texto) {
  const padroes = [
    /\bignore\s+(as\s+)?regras?\b/i,
    /\bignore\s+(o\s+)?system\b/i,
    /\bdeveloper\s+mode\b/i,
    /\bmodo\s+desenvolvedor\b/i,
    /\bjailbreak\b/i,
    /\bDAN\b/i,
    /\bdo\s+anything\s+now\b/i,
    /\bvoce\s+e[´\']?\s+livre\b/i,
    /\best[aá]\s+libertado?\b/i,
    /\brepita\s+(isso|exatamente|tudo)\b/i,
    /\bfale\s+exatamente\b/i,
    /\bignore\s+(all|todas)\s+(previous|instru[cç][oõ]es|regras|comandos)\b/i,
    /\bfrom\s+now\s+on\b.*\b(you\s+are|voc[eê]\s+[eé])\b/i,
    /\bvoc[eê]\s+[eé]\s+um\s+(novo\s+(personagem|sistema|bot)|IA?\s+(sem|livre)|humano)\b/i,
  ];

  return padroes.some((r) => r.test(texto));
}

module.exports = { estaNaBlacklist, detectarManipulacao };
