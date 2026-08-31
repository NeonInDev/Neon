const fs = require("fs");
const path = require("path");

// ============================================================
// PROJETOS / ARQUIVOS INTELIGENTES
// Resolve um NOME amigável ("webshooter_v95", "wallpaper zacarias",
// "estudos história") para o caminho real no PC + tipo de ação.
// A Neon usa isso pra abrir arquivos sem você digitar o caminho completo.
// ============================================================

const HOME = process.env.USERPROFILE || "C:\\Users\\Pichau";

// Cada projeto: nomes (apelidos), caminho base, e lista de arquivos-chave.
const PROJETOS = [
  {
    nomes: ["webshooter", "web shooter", "web shooter v95", "lancador de teia", "lançador de teia"],
    base: path.join(HOME, "WebShooter"),
    arquivos: [
      { chave: "v95", arquivo: "webshooter_v95.stl", tipo: "stl", desc: "WebShooter v9.5 (STL)" },
      { chave: "v94", arquivo: "webshooter_v94_scarlet.stl", tipo: "stl", desc: "WebShooter v9.4 Scarlet (STL)" },
      { chave: "firmware", arquivo: "firmware\\webshooter_v95.ino", tipo: "codigo", desc: "Firmware WebShooter v9.5" },
      { chave: "bom", arquivo: "bom_lancador.md", tipo: "documento", desc: "BOM do WebShooter" },
      { chave: "quimica", arquivo: "quimica_teia.md", tipo: "documento", desc: "Química da teia" },
      { chave: "mockup", arquivo: "webshooter_v95_mockup.stl", tipo: "stl", desc: "WebShooter v9.5 mockup (STL)" },
    ],
  },
  {
    nomes: ["wallpaper zacarias", "zacarias", "wallpaper"],
    base: path.join(HOME, "Downloads"),
    arquivos: [
      { chave: "za", arquivo: "wallpaper_zacarias.html", tipo: "navegador", desc: "Wallpaper Zacarias (rave)" },
      { chave: "mascara", arquivo: "zacarias_mascara.png", tipo: "imagem", desc: "Zacarias com máscara (fundo removido)" },
      { chave: "sem_mascara", arquivo: "zacarias_sem_mascara.png", tipo: "imagem", desc: "Zacarias sem máscara (fundo removido)" },
    ],
  },
  {
    nomes: ["estudos", "historia", "história", "revisao", "revisão", "estudo", "prova"],
    base: path.join(HOME, "estudos"),
    arquivos: [
      { chave: "revisao", arquivo: "revisao_global_2tri.md", tipo: "documento", desc: "Revisão global 2º tri" },
      { chave: "historia", arquivo: "revisao_global_2tri.md", tipo: "documento", desc: "Revisão de História" },
      { chave: "história", arquivo: "revisao_global_2tri.md", tipo: "documento", desc: "Revisão de História" },
    ],
  },
  {
    nomes: ["neon", "neon ai", "assistente"],
    base: path.join(HOME, "Neon"),
    arquivos: [
      { chave: "versala", arquivo: "src\\versala.js", tipo: "codigo", desc: "Integração Versala" },
      { chave: "versala", arquivo: "src\\imagens.js", tipo: "codigo", desc: "Funções de imagem" },
    ],
  },
];

// Retorna o arquivo mais provável pro nome dado. Tenta casar do mais específico
// (nome+chave) pro mais genérico (só o projeto).
function resolver(textoProcurado) {
  const lower = textoProcurado.toLowerCase().trim();

  let projeto = null;
  let arquivo = null;

  // 1) Tenta achar o projeto pelos apelidos
  projeto = PROJETOS.find((p) => p.nomes.some((n) => lower.includes(n)));

  // 2) Dentro do projeto, tenta casar uma chave específica
  if (projeto) {
    arquivo = projeto.arquivos.find((a) => a.chave && lower.includes(a.chave.toLowerCase()));
    if (arquivo) {
      const caminho = path.join(projeto.base, arquivo.arquivo);
      return { nome: arquivo.desc, caminho, tipo: arquivo.tipo, base: projeto.base };
    }
    // Nenhuma chave específica: resolve o caminho base (abre a pasta)
    return { nome: projeto.nomes[0], caminho: projeto.base, tipo: "pasta", base: projeto.base };
  }

  // 3) Fallback: talvez o usuário passou um caminho/nome de arquivo direto
  if (fs.existsSync(lower)) {
    const caminho = path.resolve(lower);
    return { nome: path.basename(caminho), caminho, tipo: tipoDe(caminho), base: path.dirname(caminho) };
  }

  // 4) Procura um arquivo por nome parecido na pasta home (recursivo, limitado)
  const achado = buscarPorNome(lower);
  if (achado) return achado;

  return null;
}

function tipoDe(caminho) {
  const ext = path.extname(caminho).toLowerCase();
  if (ext === ".stl") return "stl";
  if (ext === ".blend") return "blender";
  if (ext === ".html" || ext === ".htm") return "navegador";
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(ext)) return "imagem";
  if (/\.(ino|c|h|cpp|js|ts|py|md|txt)$/i.test(ext)) return "codigo";
  return "pasta";
}

function buscarPorNome(nome) {
  if (!nome || nome.length < 3) return null;
  const querys = [nome.replace(/\s+/g, ""), nome.replace(/\s+/g, "_")];
  const pastasRaiz = [HOME, path.join(HOME, "WebShooter"), path.join(HOME, "estudos"), path.join(HOME, "Downloads"), path.join(HOME, "Neon")];
  const limites = { [HOME]: 2 };
  const vistos = new Set();
  for (const raiz of pastasRaiz) {
    const passos = new Set(raiz.split(path.sep).length + 1);
    const resultado = varrer(raiz, querys, 0, passos, vistos, limites[raiz] || 3);
    if (resultado) return resultado;
  }
  return null;
}

function varrer(dir, querys, profundidade, passos, vistos, limiteProf) {
  if (profundidade > limiteProf) return null;
  let entradas;
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entradas) {
    const cheio = path.join(dir, e.name);
    if (vistos.has(cheio)) continue;
    vistos.add(cheio);
    const base = e.name.toLowerCase().replace(/\.\w+$/, "");
    const semExt = base.replace(/[\s_.-]+/g, "");
    if (querys.some((q) => {
      const qq = q.replace(/[\s_.-]+/g, "");
      return qq && (semExt === qq || semExt.includes(qq) || qq.includes(semExt));
    }) && fs.statSync(cheio).isFile()) {
      return { nome: e.name, caminho: cheio, tipo: tipoDe(cheio), base: dir };
    }
    if (e.isDirectory() && !/node_modules|\.git|\.whatsapp|\.wwebjs|\.opencode|AppData|node_modules/i.test(e.name)) {
      const r = varrer(cheio, querys, profundidade + 1, passos, vistos, limiteProf);
      if (r) return r;
    }
  }
  return null;
}

// Lista todos os projetos conhecidos (pra página do HUD)
function listar() {
  return PROJETOS.map((p) => ({
    nome: p.nomes[0],
    apelidos: p.nomes,
    base: p.base,
    arquivos: p.arquivos.map((a) => ({
      chave: a.chave,
      nome: a.desc,
      arquivo: a.arquivo,
      tipo: a.tipo,
      caminho: path.join(p.base, a.arquivo),
    })),
  }));
}

module.exports = { resolver, listar, tipoDe };
