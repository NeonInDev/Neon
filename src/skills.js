const fs = require("fs");
const path = require("path");
const opencode = require("../plugins/opencode");
const { OWNER } = require("./perm");
const { log } = require("./logger");

const DATA_DIR = path.join(__dirname, "..", "data");
const SKILLS_FILE = path.join(DATA_DIR, "skills.json");
const MAX_SKILLS = 50;

const SKILLS_DIR = path.join(__dirname, "..", "skills");
const MANIFEST_FILE = path.join(SKILLS_DIR, "_manifest.json");

function carregar() {
  try {
    if (!fs.existsSync(SKILLS_FILE)) return [];
    const dados = JSON.parse(fs.readFileSync(SKILLS_FILE, "utf8"));
    return Array.isArray(dados) ? dados : [];
  } catch (err) {
    log("WARN", "[SKILLS] Falha ao carregar skills", { erro: err.message });
    return [];
  }
}

function salvar(skills) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SKILLS_FILE, JSON.stringify(skills.slice(-MAX_SKILLS), null, 2), "utf8");
}

function slugSeguro(nome) {
  return String(nome || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48);
}

function respostaIndicaFalta(texto) {
  return /não sei|nao sei|não consigo|nao consigo|não tenho|nao tenho|ainda não sei|ainda nao sei|não possuo|nao possuo|não tenho como|não faço ideia|não knows|não tenho acesso|não consigo acessar/i.test(String(texto || ""));
}

function proibida(skill) {
  const texto = JSON.stringify(skill).toLowerCase();
  return /ransomware|keylogger|bypass|exploit|credential.?theft|steal.?password|hack.?account|phishing|ddos|malware|virus.?create|backdoor/i.test(texto);
}

function contexto() {
  let txt = "";
  const skills = carregar();
  if (skills.length) {
    txt += "\n\nSKILLS APRENDIDAS E ATIVAS:\n" + skills
      .map((s) => `- ${s.nome}: ${s.instrucoes}`)
      .join("\n");
  }
  const executaveis = ferramentasSkills();
  if (executaveis) {
    txt += `\n\nFERRAMENTAS DE SKILL (executáveis via FERRAMENTA: skill_...):\n${executaveis}`;
  }
  try {
    const factory = require("./mcp-factory");
    txt += "\n\nMCPS DO TEU OPENCODE (inventário atual do opencode.json):\n" + factory.inventarioEmTexto();
    txt += "\nPara desenvolver um MCP novo quando o dono pedir uma capacidade que você não tem, use a skill skill_mcp_factory.";
  } catch (err) {
    log("WARN", "[SKILLS] Falha ao incluir inventário de MCPs", { erro: err.message });
  }
  return txt;
}

async function avisarOwner(skill, status, detalhe = "") {
  try {
    const { client } = require("./client");
    const usuario = await client.users.fetch(OWNER);
    await usuario.send([
      "🧠 **Skill da Neon**",
      `**Nome:** ${skill.nome}`,
      `**Status:** ${status}`,
      `**Descrição:** ${skill.descricao}`,
      skill.instrucoes ? `**Instruções:** ${skill.instrucoes}` : "",
      detalhe ? `**Detalhes:** ${detalhe}` : "",
    ].filter(Boolean).join("\n"));
  } catch (err) {
    log("WARN", "[SKILLS] Falha ao avisar dono", { erro: err.message });
  }
}

// ========== SKILLS EXECUTÁVEIS ==========

function carregarManifest() {
  try {
    if (!fs.existsSync(MANIFEST_FILE)) return [];
    const dados = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
    return Array.isArray(dados?.skills) ? dados.skills : [];
  } catch (err) {
    log("WARN", "[SKILLS] Falha ao carregar manifest", { erro: err.message });
    return [];
  }
}

function salvarManifest(skills) {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify({ skills, versao: 1 }, null, 2), "utf8");
}

const cacheModulos = new Map();

function carregarModuloSkill(id) {
  if (cacheModulos.has(id)) return cacheModulos.get(id);
  const arquivo = path.join(SKILLS_DIR, `${id}.js`);
  if (!fs.existsSync(arquivo)) return null;
  try {
    delete require.cache[require.resolve(arquivo)];
    const mod = require(arquivo);
    cacheModulos.set(id, mod);
    return mod;
  } catch (err) {
    log("WARN", `[SKILLS] Falha ao carregar módulo ${id}`, { erro: err.message });
    return null;
  }
}

function listarSkillsExecutaveis() {
  const manifest = carregarManifest();
  return manifest.filter((s) => {
    const arquivo = path.join(SKILLS_DIR, `${s.id}.js`);
    return fs.existsSync(arquivo);
  });
}

function ferramentasSkills() {
  const skills = listarSkillsExecutaveis();
  if (!skills.length) return "";
  return skills
    .map((s) => `- skill_${s.id}: ${s.descricao}. Uso: skill_${s.id} | [argumentos]`)
    .join("\n");
}

async function executarSkill(nome, args) {
  const id = nome.replace(/^skill_/, "");
  const manifest = carregarManifest();
  const meta = manifest.find((s) => s.id === id);
  if (!meta) return `❌ Skill "${id}" não encontrada.`;

  const mod = carregarModuloSkill(id);
  if (!mod || typeof mod.executar !== "function") return `❌ Skill "${id}" não pôde ser carregada.`;

  log("INFO", "[SKILLS] Executando skill", { id, args: String(args || "").slice(0, 100) });
  try {
    const resultado = await mod.executar(args || "");
    return String(resultado || "").slice(0, 4000);
  } catch (err) {
    log("ERROR", "[SKILLS] Erro ao executar skill", { id, erro: err.message });
    return `❌ Erro na skill "${meta.nome}": ${err.message}`;
  }
}

async function aprenderExecutavel(userInput, respostaAnterior) {
  if (!respostaIndicaFalta(respostaAnterior)) return null;

  log("INFO", "[SKILLS] Iniciando aprendizado executavel", { pedido: String(userInput).slice(0, 100) });

  const prompt = [
    "Você é um engenheiro de software que cria módulos Node.js para um bot chamado Neon.",
    "",
    "O usuário pediu algo que a Neon não sabe fazer. Crie um módulo que resolve isso.",
    "",
    "REGRAS:",
    "- O módulo DEVE ser um arquivo Node.js válido (CommonJS, module.exports).",
    "- Exporte: { nome: string, descricao: string, executar: async (args) => string }",
    "- Use APENAS módulos padrão do Node.js (https, fs, path) OU módulos já instalados no projeto (axios, cheerio, sharp).",
    "- NÃO use APIs que precisem de chave de API a menos que esteja explícito no pedido.",
    "- O módulo DEVE funcionar de forma autônoma (sem dependências externas não instaladas).",
    "- Retorne SOMENTE o código JavaScript puro, sem explicações, sem markdown, sem ```.",
    "- O código deve ser curto e direto (máximo 200 linhas).",
    "",
    `Pedido do usuário: ${String(userInput).slice(0, 1200)}`,
  ].join("\n");

  const bruto = await opencode.executar(prompt);
  if (!bruto) return null;

  let codigo = bruto.trim();
  codigo = codigo.replace(/^```(?:javascript|js)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  if (!codigo.includes("module.exports") && !codigo.includes("exports.")) {
    log("WARN", "[SKILLS] Resposta do opencode não é módulo válido");
    return null;
  }

  const nomeMatch = codigo.match(/nome:\s*["'`](.+?)["'`]/);
  const descMatch = codigo.match(/descricao:\s*["'`](.+?)["'`]/);
  const nome = nomeMatch ? nomeMatch[1] : userInput.slice(0, 40);
  const descricao = descMatch ? descMatch[1] : `Skill aprendida: ${nome}`;
  const id = slugSeguro(nome);

  if (!id) return null;

  if (proibida({ nome, descricao, codigo })) {
    await avisarOwner({ nome, descricao }, "bloqueada", "Código continha termos proibidos.");
    return null;
  }

  const manifest = carregarManifest();
  const existente = manifest.find((s) => s.id === id);

  const arquivo = path.join(SKILLS_DIR, `${id}.js`);
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  fs.writeFileSync(arquivo, codigo, "utf8");

  const skillMeta = {
    id,
    nome,
    descricao,
    arquivo: `${id}.js`,
    criadaEm: existente ? existente.criadaEm : new Date().toISOString(),
    atualizadaEm: new Date().toISOString(),
  };

  const nova = manifest.filter((s) => s.id !== id);
  nova.push(skillMeta);
  salvarManifest(nova);

  cacheModulos.delete(id);
  const mod = carregarModuloSkill(id);

  await avisarOwner(skillMeta, "aprendida e salva", `Arquivo: skills/${id}.js`);
  log("INFO", "[SKILLS] Skill executavel criada", { id, nome, arquivo: `skills/${id}.js` });

  return skillMeta;
}

function iniciar() {
  const skills = listarSkillsExecutaveis();
  if (skills.length) {
    log("INFO", "[SKILLS] Skills executaveis carregadas", { total: skills.length, ids: skills.map((s) => s.id) });
  }
}

module.exports = {
  contexto,
  carregar,
  respostaIndicaFalta,
  iniciar,
  listarSkillsExecutaveis,
  ferramentasSkills,
  executarSkill,
  aprenderExecutavel,
  carregarModuloSkill,
};