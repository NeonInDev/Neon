const fs = require("fs");
const path = require("path");
const opencode = require("../plugins/opencode");
const { OWNER } = require("./perm");
const { log } = require("./logger");

const DATA_DIR = path.join(__dirname, "..", "data");
const SKILLS_FILE = path.join(DATA_DIR, "skills.json");
const MAX_SKILLS = 50;

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
  return /nao possuo|não possuo|nao sei como|não sei como|não tenho habilidade|nao tenho habilidade|não consigo entender|nao consigo entender|ainda não sei|ainda nao sei/i.test(String(texto || ""));
}

function proibida(skill) {
  const texto = JSON.stringify(skill).toLowerCase();
  return /senha|token|credential|credencial|cookie|\.whatsapp|formatar|shutdown|desligar|apagar.*sistema|ransomware|keylogger|bypass|exploit/.test(texto);
}

function contexto() {
  const skills = carregar();
  if (!skills.length) return "";
  return "\n\nSKILLS APRENDIDAS E ATIVAS:\n" + skills
    .map((s) => `- ${s.nome}: ${s.instrucoes}`)
    .join("\n");
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
      `**Instruções:** ${skill.instrucoes}`,
      detalhe ? `**Detalhes:** ${detalhe}` : "",
    ].filter(Boolean).join("\n"));
  } catch (err) {
    log("WARN", "[SKILLS] Falha ao avisar dono", { erro: err.message });
  }
}

async function aprender(userInput, respostaAnterior) {
  if (!respostaIndicaFalta(respostaAnterior)) return null;

  const prompt = [
    "Você é o criador seguro de skills da Neon.",
    "Crie uma skill de conhecimento/assistência para atender o pedido abaixo.",
    "Não crie código, não execute comandos e não use credenciais.",
    "A skill deve ser apenas instruções para a IA usar fontes públicas e ferramentas já disponíveis.",
    "Responda SOMENTE JSON válido com as chaves: nome, descricao, instrucoes, teste.",
    "nome deve ser curto em português; instrucoes deve ter no máximo 500 caracteres.",
    `Pedido do usuário: ${String(userInput).slice(0, 1200)}`,
  ].join("\n");

  const bruto = await opencode.executar(prompt);
  if (!bruto) return null;

  try {
    const trecho = bruto.match(/\{[\s\S]*\}/)?.[0];
    const proposta = JSON.parse(trecho);
    const skill = {
      id: slugSeguro(proposta.nome),
      nome: String(proposta.nome || "").trim().slice(0, 80),
      descricao: String(proposta.descricao || "").trim().slice(0, 240),
      instrucoes: String(proposta.instrucoes || "").trim().slice(0, 500),
      teste: String(proposta.teste || "").trim().slice(0, 240),
      criadaEm: new Date().toISOString(),
    };
    if (!skill.id || !skill.nome || !skill.instrucoes || proibida(skill)) {
      await avisarOwner(skill, "bloqueada", "A proposta não passou pelas regras de segurança.");
      return null;
    }

    const skills = carregar().filter((s) => s.id !== skill.id);
    skills.push(skill);
    salvar(skills);
    await avisarOwner(skill, "ativada", "Skill criada em modo instruções, sem execução autônoma de código.");
    log("INFO", "[SKILLS] Skill ativada", { id: skill.id, nome: skill.nome });
    return skill;
  } catch (err) {
    log("WARN", "[SKILLS] Proposta inválida", { erro: err.message });
    return null;
  }
}

module.exports = { contexto, aprender, carregar, respostaIndicaFalta };
