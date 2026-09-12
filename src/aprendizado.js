// Auto-aprendizado: detecta preferências, gostos e rotinas nas mensagens do
// usuário (dono) e salva automaticamente como memória e no perfil.
// Chamado no início do askNeon, só para o dono.

const { log } = require("./logger");
const memoria = require("./memoria");

// Normaliza acentos pra facilitar o regex.
function norm(s) {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Gatilho: regex + função que extrai { tema, objeto } do match.
// tipo define onde salvar no perfil/memória:
//   "preferencia" -> gostos + memória categoria preferencia
//   "avesso"      -> observações (o que não gosta) + memória preferencia
//   "dado"        -> observações + memória categoria pessoal
//   "rotina"      -> observações + memória categoria conhecimento
//   "desejo"      -> observações + memória categoria lembrete
const GATILHOS = [
  { // "eu gosto de X" / "gosto de X" / "gosto muito de X" (ignora negação)
    re: /(?<!nao\s)(?<!nem\s)\b(?:eu\s+)?gosto\s+(?:muito\s+)?(?:de\s+)?(.+)/i,
    tipo: "preferencia",
    tema: () => "gosta de",
    extrair: (m) => m[1],
  },
  { // "eu amo X" / "amo X" / "curto X" / "adoro X" (ignora negação)
    re: /(?<!nao\s)(?<!nem\s)\b(?:eu\s+)?(?:amo|adoro|curto)\s+(?:de\s+)?(.+)/i,
    tipo: "preferencia",
    tema: () => "ama",
    extrair: (m) => m[1],
  },
  { // "meu jogo favorito é GTA" -> tema "jogo favorito", objeto "GTA"
    re: /\bmeu\s+([a-z\u00e0-\u00ff]+(?:\s+[a-z\u00e0-\u00ff]+)?)\s+favorit[oa]\s+(?:é|e|eh)\s+(.+)/i,
    tipo: "preferencia",
    tema: (m) => `${m[1]} favorito`,
    extrair: (m) => m[2],
  },
  { // "eu prefiro X"
    re: /\b(?:eu\s+)?prefiro\s+(.+)/i,
    tipo: "preferencia",
    tema: () => "prefere",
    extrair: (m) => m[1],
  },
  { // "eu odeio X" / "não gosto de X" / "detesto X" / "não curto X"
    re: /\b(?:eu\s+)?(?:od[eé]io|detesto|n[aã]o\s+(?:gosto|curto))\s+(?:de\s+)?(.+)/i,
    tipo: "avesso",
    tema: () => "não gosta de",
    extrair: (m) => m[1],
  },
  { // "meu nome é X" / "meu aniversário é X" / "meu time é X" / "meu pet é X"
    re: /\bmeu\s+(nome|anivers[aá]rio|niver|time|trabalho|emprego|cachorro|gato|pet|carro|celular|pc|computador|jogo)\s+(?:é|e|eh|se\s+chama)\s+(.+)/i,
    tipo: "dado",
    tema: (m) => `meu ${m[1].toLowerCase()}`,
    extrair: (m) => m[2],
  },
  { // "eu moro em X" / "eu sou de X" / "vivo em X"
    re: /\b(?:eu\s+)?(?:moro\s+em|sou\s+de|vivo\s+em)\s+(.+)/i,
    tipo: "dado",
    tema: () => "mora em",
    extrair: (m) => m[1],
  },
  { // "eu tenho X anos" / "tenho X anos"
    re: /\b(?:eu\s+)?tenho\s+(\d{1,2})\s+anos\b/i,
    tipo: "dado",
    tema: () => "idade",
    extrair: (m) => m[1],
  },
  { // "eu trabalho com X" / "trabalho com X"
    re: /\b(?:eu\s+)?trabalho\s+(?:com|em|na|no)\s+(.+)/i,
    tipo: "dado",
    tema: () => "trabalha com",
    extrair: (m) => m[1],
  },
  { // "eu sempre jogo X" / "sempre escuto X"
    re: /\b(?:eu\s+)?sempre\s+(?:jogo|joga|escuto|ou[çc]o|vejo|assisto|leio)\s+(.+)/i,
    tipo: "rotina",
    tema: () => "costuma",
    extrair: (m) => m[1],
  },
  { // "eu costumo X" / "costumo X"
    re: /\b(?:eu\s+)?costumo\s+(.+)/i,
    tipo: "rotina",
    tema: () => "costuma",
    extrair: (m) => m[1],
  },
  { // "toda noite eu X" / "de manhã eu X" / "geralmente eu X"
    re: /\b(?:toda\s+noite|de\s+manh[aã]|de\s+tarde|[aà]\s+noite|geralmente|normalmente)\s+(?:eu\s+)?(.+)/i,
    tipo: "rotina",
    tema: () => "rotina",
    extrair: (m) => m[1],
  },
  { // "eu quero X" / "quero X" (desejo persistente)
    re: /\b(?:eu\s+)?(?:quero|queria|pretendo)\s+(?!que\s+(?:voc[aê]|vc))(.+)/i,
    tipo: "desejo",
    tema: () => "quer",
    extrair: (m) => m[1],
  },
  { // "eu gostaria que você X" -> instrução persistente
    re: /\b(?:eu\s+)?gostaria\s+que\s+(?:voc[aê]|vc)\s+(.+)/i,
    tipo: "instrucao",
    tema: () => "pediu que a Neon",
    extrair: (m) => m[1],
  },
];

// Evita ativar com perguntas, comandos ou frases genéricas/curtas.
function ehRuido(texto) {
  const t = texto.trim();
  if (t.length < 8) return true;
  if (/\?$|\b(?:quem|o\s*que|qual|como|onde|quando|por\s*que)\b/i.test(t)) return true;
  if (/^(?:neon|ã®Â©)/i.test(t)) return true;
  if (/^(?:manda|envia|abre|liga|toca|roda|instala|cria|edita|pesquisa|busca|traduz|tira|mostra|desliga)/i.test(norm(t))) return true;
  return false;
}

// Limpa objetos curtos/sem sentido.
function limparObjeto(objeto) {
  let o = objeto.trim().replace(/[.,!?;]+$/g, "").trim();
  // remove cláusulas "... quando X" que são contexto, mantém a parte principal
  o = o.replace(/\s+(?:quando|porque|pois|pra|para|se)\s+.*$/i, "").trim();
  return o;
}

async function processar(userId, user, texto) {
  try {
    if (!userId || !texto || typeof texto !== "string") return;
    if (ehRuido(texto)) return;

    const tNorm = norm(texto).toLowerCase();
    let detectado = null;

    for (const g of GATILHOS) {
      const m = tNorm.match(g.re);
      if (m) {
        const objeto = limparObjeto(g.extrair(m));
        if (!objeto || objeto.length < 2) continue;
        detectado = { tema: g.tema(m), objeto, tipo: g.tipo || "preferencia" };
        break;
      }
    }

    if (!detectado) return;

    const { tema, objeto, tipo } = detectado;
    const leitura = `${tema}: ${objeto}`;
    const categorias = {
      preferencia: "preferencia",
      avesso: "preferencia",
      dado: "pessoal",
      rotina: "conhecimento",
      desejo: "lembrete",
      instrucao: "config",
    };
    const categoria = categorias[tipo] || "outro";
    const prioridade = tipo === "dado" || tipo === "instrucao" ? 5 : 4;

    // Memória com chave única por objeto (evita colisão). Não duplica igual.
    const todas = await memoria.listar();
    const chave = `${categoria}:${norm(objeto).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`;
    const jaExiste = todas.some((m) => {
      if (m.chave === chave) return true;
      const mv = norm(m.valor || "").toLowerCase().trim();
      const ov = norm(objeto).toLowerCase().trim();
      return mv === `${norm(tema).toLowerCase()}: ${ov}`;
    });
    if (!jaExiste) {
      await memoria.lembrar(chave, leitura, categoria, prioridade);
    }

    // Adiciona ao perfil do usuário.
    if (user && user.perfil) {
      const perfil = user.perfil;
      if (!perfil.personalidade) perfil.personalidade = [];
      const emPerfil = [...perfil.gostos, ...perfil.observacoes].some((obs) => {
        const o = norm(String(obs)).toLowerCase().trim();
        const ov = norm(objeto).toLowerCase().trim();
        return o === ov || o.includes(ov) || ov.includes(o);
      });
      if (!emPerfil) {
        if (tipo === "preferencia" || tipo === "avesso") {
          perfil.gostos.push(tipo === "avesso" ? `não gosta de ${objeto}` : objeto);
          if (perfil.gostos.length > 30) perfil.gostos.shift();
        } else {
          perfil.observacoes.push(`${tema} ${objeto}`.trim());
          if (perfil.observacoes.length > 30) perfil.observacoes.shift();
        }
      }
    }

    log("INFO", "[APRENDIZADO] Detectado", { tema, objeto, tipo, categoria });
  } catch (err) {
    log("WARN", "[APRENDIZADO] Erro ao processar", { erro: err.message });
  }
}

module.exports = { processar };