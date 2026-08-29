// Moldes oficiais de formatação do servidor NEW GENESIS
// Molde "Quirk File" para cards de quirk e molde "Staff Chat" para mensagens da Neon.

const TIPO_EMOJI = { Emissora: "⚡", Mutação: "🧬", Transformação: "🌀" };
const TIPO_EMOJI_FALLBACK = "✨";

// título em negrito unicode (estilo matemático) — ex.: ZERO GRAVITY -> 𝐙𝐄𝐑𝐎 𝐆𝐑𝐀𝐕𝐈𝐓𝐘
function negritoUnicode(s) {
  const mapa = {
    A: "𝐀", B: "𝐁", C: "𝐂", D: "𝐃", E: "𝐄", F: "𝐅", G: "𝐆", H: "𝐇", I: "𝐈",
    J: "𝐉", K: "𝐊", L: "𝐋", M: "𝐌", N: "𝐍", O: "𝐎", P: "𝐏", Q: "𝐐", R: "𝐑",
    S: "𝐒", T: "𝐓", U: "𝐔", V: "𝐕", W: "𝐖", X: "𝐗", Y: "𝐘", Z: "𝐙",
    "0": "𝟎", "1": "𝟏", "2": "𝟐", "3": "𝟑", "4": "𝟒", "5": "𝟓", "6": "𝟔",
    "7": "𝟕", "8": "𝟖", "9": "𝟗", " ": " ",
    "à": "𝐚", "á": "𝐚", "â": "𝐚", "ã": "𝐚", "ä": "𝐚", "ç": "𝐜", "é": "𝐞",
    "ê": "𝐞", "í": "𝐢", "ó": "𝐨", "ô": "𝐨", "õ": "𝐨", "ú": "𝐮", "ü": "𝐮",
  };
  return String(s || "")
    .toUpperCase()
    .split("")
    .map((c) => mapa[c] || c)
    .join("");
}

// linha de topo do card (box)
const LINHA_TOP = "╭─────────────── ⋆⋅☆⋅⋆ ───────────────╮";
const LINHA_HEADER = "          𓆩 ⚡ 𝐐𝐔𝐈𝐑𝐊 𝐅𝐈𝐋𝐄 ⚡ 𓆪";
const LINHA_MEIO = "╰─────────────── ⋆⋅☆⋅⋆ ───────────────╯";
const LINHA_FIM = "╰────────────────────────────────────╯ ⌜ ⌟・chat-staff・⌞ ✦ ⌝";

// ---- Molde Quirk File (card de quirk) ----
// dados: { titulo, descricao, desvantagens?, tipo?, usuario? }
function moldeQuirkFile(dados) {
  const emoji = TIPO_EMOJI[dados.tipo] || TIPO_EMOJI_FALLBACK;
  const linhas = [LINHA_TOP, LINHA_HEADER, LINHA_MEIO, "", `          ◈ ${negritoUnicode(dados.titulo)} ◈`, ""];
  linhas.push(`> \`\`${emoji}\`\` ➮ __${limparMulti(dados.descricao)}__`);
  if (dados.desvantagens) {
    linhas.push("", `> \`\`⚠️\`\` ➸ **Desvantagens➳** __${limparMulti(dados.desvantagens)}__`);
  }
  if (dados.usuario) {
    linhas.push("", "   ✦ Usuário:", `   ➥ __${limparMulti(dados.usuario)}__`);
  }
  linhas.push("", "   ✦ Tipo de Quirk:", `   ➥ __\`${dados.tipo || "Desconhecido"}\`__`, "", LINHA_FIM);
  return limparFinal(linhas.join("\n"));
}

// ---- Molde Staff Chat (mensagem da Neon nos chats) ----
// dados: { titulo, conteudo, icone? }
function moldeChatStaff(dados) {
  const icon = dados.icone || "⚡";
  const linhas = [
    LINHA_TOP,
    `          𓆩 ${icon} ${negritoUnicode(dados.titulo)} ${icon} 𓆪`,
    LINHA_MEIO,
    "",
    String(dados.conteudo || "").trim(),
    "",
    LINHA_FIM,
  ];
  return limparFinal(linhas.join("\n"));
}

function limparMulti(s) {
  return String(s || "").replace(/\n{2,}/g, "\n").trim();
}

function limparFinal(s) {
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

// enquadra um texto de resposta no molde staff-chat, respeitando o limite do Discord (2000).
// Se não couber, divide o conteúdo em múltiplas mensagens, cada uma emoldurada.
function enquadrarResposta(texto, titulo, icone) {
  const conteudo = String(texto || "").trim();
  if (!conteudo) return [];
  const cab = `╭─────────────── ⋆⋅☆⋅⋆ ───────────────╮
          𓆩 ${icone || "⚡"} ${negritoUnicode(titulo || "NEON")} ${icone || "⚡"} 𓆪
╰─────────────── ⋆⋅☆⋅⋆ ───────────────╯

`;
  const rodape = `\n\n╰────────────────────────────────────╯ ⌜ ⌟・chat-staff・⌞ ✦ ⌝`;
  const overhead = cab.length + rodape.length;
  const MAX = 2000;

  if (conteudo.length + overhead <= MAX) return [cab + conteudo + rodape];

  // divide o conteúdo em pedaços que caibam dentro do molde (sem perder palavras)
  const alvo = MAX - overhead - 1;
  const pedacos = [];
  let restante = conteudo;
  while (restante.length > alvo) {
    let corte = restante.lastIndexOf("\n", alvo);
    if (corte <= 0) corte = restante.lastIndexOf(" ", alvo);
    if (corte <= 0) corte = alvo;
    pedacos.push(restante.slice(0, corte));
    restante = restante.slice(corte).replace(/^\s+/, "");
  }
  if (restante) pedacos.push(restante);
  return pedacos.map((p) => cab + p + rodape);
}

module.exports = { moldeQuirkFile, moldeChatStaff, negritoUnicode, enquadrarResposta, LINHA_FIM };