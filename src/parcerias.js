const fs = require("fs");
const path = require("path");
const { log } = require("./logger");
const {
  PARCERIAS_GUILD_ID,
  PARCERIAS_CANAL_ID,
  PARCERIAS_SOLICITAR_ID,
  PARCERIAS_DIVULGADOR_ROLE_ID,
} = require("./config");
const { OWNER } = require("./perm");

const ARQUIVO = path.join(__dirname, "..", "data", "parcerias.json");
const CONVITE_MAX_AGE = 0; // permanente
const CONVITE_MAX_USES = 0; // ilimitado

function carregar() {
  try {
    if (!fs.existsSync(ARQUIVO)) return { parcerias: [], solicitacoes: [] };
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
    if (!dados || typeof dados !== "object") return { parcerias: [], solicitacoes: [] };
    if (!Array.isArray(dados.parcerias)) dados.parcerias = [];
    if (!Array.isArray(dados.solicitacoes)) dados.solicitacoes = [];
    return dados;
  } catch (err) {
    log("ERROR", "[PARCERIAS] Falha ao ler registro", { erro: err.message });
    return { parcerias: [], solicitacoes: [] };
  }
}

function salvar(dados) {
  fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
  fs.writeFileSync(ARQUIVO, JSON.stringify(dados, null, 2), "utf8");
}

function listar() {
  return carregar().parcerias;
}

function registrar({ nome, invite }) {
  const dados = carregar();
  dados.parcerias.push({
    nome: String(nome).trim(),
    invite: String(invite).trim(),
    data: Date.now(),
  });
  salvar(dados);
  log("INFO", "[PARCERIAS] Parceria registrada", { nome, invite });
  return listar().find((p) => p.invite === String(invite).trim());
}

function remover(nome) {
  const dados = carregar();
  const antes = dados.parcerias.length;
  dados.parcerias = dados.parcerias.filter((p) => p.nome.toLowerCase() !== String(nome).trim().toLowerCase());
  salvar(dados);
  return dados.parcerias.length < antes;
}

function registrarSolicitacao({ autorId, autorTag, conteudo, url }) {
  const dados = carregar();
  dados.solicitacoes.push({
    autorId,
    autorTag,
    conteudo: String(conteudo).slice(0, 500),
    url,
    data: Date.now(),
  });
  salvar(dados);
}

async function gerarConvite(client) {
  const guild = client.guilds.cache.get(PARCERIAS_GUILD_ID) || (await client.guilds.fetch(PARCERIAS_GUILD_ID).catch(() => null));
  if (!guild) return { ok: false, erro: "Neon não está no servidor BNHA." };
  let canal = guild.channels.cache.get(PARCERIAS_CANAL_ID);
  if (!canal) {
    canal = await guild.channels.fetch(PARCERIAS_CANAL_ID).catch(() => null);
  }
  if (!canal) return { ok: false, erro: "Canal #parcerias não encontrado." };
  try {
    const invite = await canal.createInvite({
      maxAge: CONVITE_MAX_AGE,
      maxUses: CONVITE_MAX_USES,
      unique: true,
      reason: "Convite de parceria (Neon)",
    });
    return { ok: true, link: `https://discord.gg/${invite.code}` };
  } catch (err) {
    log("ERROR", "[PARCERIAS] Falha ao criar convite", { erro: err.message });
    return { ok: false, erro: `Sem permissão para criar convite: ${err.message}` };
  }
}

function extrairInvite(texto) {
  const m = String(texto || "").match(/discord(?:\s*\.\s*gg|app\.com\/invite)\/\s*([A-Za-z0-9_-]+)/i);
  if (m) return `https://discord.gg/${m[1]}`;
  const m2 = String(texto || "").match(/(?:https?:\/\/)?discord(?:\.gg|app\.com\/invite)\/[A-Za-z0-9_-]+/i);
  return m2 ? m2[0].trim() : null;
}

async function anunciar(client, { nome, invite }) {
  const canal = client.channels.cache.get(PARCERIAS_CANAL_ID);
  if (!canal) return { ok: false, erro: "Canal #parcerias não encontrado no cache." };
  try {
    await canal.send([
      `🤝 **Nova parceria: ${nome}!**`,
      `Venha conhecer nosso novo parceiro!`,
      `🔗 ${invite}`,
    ].join("\n"));
    return { ok: true };
  } catch (err) {
    log("ERROR", "[PARCERIAS] Falha ao anunciar", { erro: err.message });
    return { ok: false, erro: `Sem permissão para postar no #parcerias: ${err.message}` };
  }
}

async function avisarDono(client, resumo) {
  try {
    const dono = await client.users.fetch(OWNER).catch(() => null);
    if (dono) await dono.send(resumo);
  } catch (err) {
    log("WARN", "[PARCERIAS] Falha ao avisar dono", { erro: err.message });
  }
}

module.exports = {
  carregar,
  listar,
  registrar,
  remover,
  registrarSolicitacao,
  gerarConvite,
  extrairInvite,
  anunciar,
  avisarDono,
  PARCERIAS_GUILD_ID,
  PARCERIAS_CANAL_ID,
  PARCERIAS_SOLICITAR_ID,
  PARCERIAS_DIVULGADOR_ROLE_ID,
};