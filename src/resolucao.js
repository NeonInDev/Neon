// Marca quando a Neon realmente resolve alguma coisa para alguem (dar warn,
// silenciar, expulsar, criar skill nova) e assina a resposta seguinte.
//
// A assinatura e de uso unico e expira: sem isso, um dia ela comecaria a
// aparecer em conversa normal e perderia o sentido de "xeque mate".
// A chave e so o userId porque ID do Discord e globalmente unico.
const VALOR_MS = 120000;
const marcas = new Map();

function marcar(userId, motivo) {
  const id = String(userId || "");
  if (!/^\d{15,25}$/.test(id)) return false;
  marcas.set(id, { motivo: motivo || "", em: Date.now() });
  return true;
}

function consumir(userId) {
  const id = String(userId || "");
  const m = marcas.get(id);
  if (!m) return null;
  marcas.delete(id);
  return Date.now() - m.em > VALOR_MS ? null : m;
}

// Anexa a assinatura no fim da resposta, uma vez so.
// O ⚔️ precisa vir em grupo: "⚔️?" tornaria opcional so o seletor de variacao
// (U+FE0F) e o deixaria obrigatorio, quebrando "Xeque Mate" sem emoji.
const REG_ASSINATURA = /\n*\s*(?:\u2694\uFE0F)?\s*\*?\*?Xeque\s*Mate\*?\*?\s*$/i;

function assinar(texto, userId) {
  const base = String(texto || "").trim();
  if (!base) return texto;
  const m = consumir(userId);
  if (!m) return texto;
  const limpo = base.replace(REG_ASSINATURA, "").trim();
  return `${limpo}\n\n⚔️ **Xeque Mate**`;
}

module.exports = { marcar, consumir, assinar };
