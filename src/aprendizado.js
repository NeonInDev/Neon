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
const GATILHOS = [
  { // "eu gosto de X" / "gosto de X" / "gosto muito de X"
    re: /\b(?:eu\s+)?gosto\s+(?:muito\s+)?de\s+(.+)/i,
    tema: () => "gosta",
    extrair: (m) => m[1],
  },
  { // "eu amo X" / "amo X"
    re: /\b(?:eu\s+)?amo\s+(.+)/i,
    tema: () => "ama",
    extrair: (m) => m[1],
  },
  { // "eu odeio X" / "não gosto de X"
    re: /\b(?:eu\s+)?(?:od.eio|n[aã]o\s+gosto)\s+(?:de\s+)?(.+)/i,
    tema: () => "não gosta",
    extrair: (m) => m[1],
  },
  { // "eu prefiro X"
    re: /\b(?:eu\s+)?prefiro\s+(.+)/i,
    tema: () => "prefere",
    extrair: (m) => m[1],
  },
  { // "meu jogo favorito é GTA" -> tema "favorito:jogo", objeto "GTA"
    re: /\bmeu\s+([a-z\u00e0-\u00ff]+)\s+favorito\s+(?:é|e|eh)\s+(.+)/i,
    tema: (m) => `favorito (${m[1]})`,
    extrair: (m) => m[2],
  },
  { // "eu sempre jogo X" / "sempre escuto X" / "costumo X"
    re: /\b(?:eu\s+)?sempre\s+(?:jogo|joga|escuto|ou[çc]o)\s+(.+)/i,
    tema: () => "costuma",
    extrair: (m) => m[1],
  },
  { // "eu costumo X"
    re: /\b(?:eu\s+)?costumo\s+(.+)/i,
    tema: () => "costuma",
    extrair: (m) => m[1],
  },
  { // "eu gostaria que você X" -> instrução persistente
    re: /\b(?:eu\s+)?gostaria\s+que\s+(?:voc[aê]|vc)\s+(.+)/i,
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
        if (!objeto || objeto.length < 3) continue;
        detectado = { tema: g.tema(m), objeto };
        break;
      }
    }

    if (!detectado) return;

    const tema = detectado.tema;
    const objeto = detectado.objeto;
    const leitura = `${tema}: ${objeto}`;

    // Memória (categoria preferencia), chave única por objeto (evita colisão
    // entre múltiplos gostos). Se já existe um conteúdo igual, não duplica.
    const todas = await memoria.listar();
    const chave = `preferencia:${objeto.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const jaExiste = todas.some((m) =>
      m.chave === chave ||
      norm(m.valor || "").toLowerCase().includes(norm(objeto).toLowerCase()) ||
      norm(objeto).toLowerCase().includes(norm(m.valor || "").toLowerCase())
    );
    if (!jaExiste) {
      await memoria.lembrar(chave, leitura, "preferencia", 4);
    }

    // Adiciona ao perfil do usuário (gostos / observacoes).
    if (user && user.perfil) {
      const perfil = user.perfil;
      const emPerfil = [...perfil.gostos, ...perfil.observacoes].some((obs) =>
        norm(String(obs)).toLowerCase().includes(norm(objeto).toLowerCase()) ||
        norm(objeto).toLowerCase().includes(norm(String(obs)).toLowerCase())
      );
      if (!emPerfil) {
        if (/gosta|ama|favorito|costuma|prefere/.test(norm(tema))) {
          perfil.gostos.push(objeto);
          if (perfil.gostos.length > 30) perfil.gostos.shift();
        } else {
          perfil.observacoes.push(`${tema} ${objeto}`);
          if (perfil.observacoes.length > 30) perfil.observacoes.shift();
        }
      }
    }

    log("INFO", "[APRENDIZADO] Detectado", { tema, objeto });
  } catch (err) {
    log("WARN", "[APRENDIZADO] Erro ao processar", { erro: err.message });
  }
}

module.exports = { processar };