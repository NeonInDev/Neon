const { client } = require("./client");
const { log } = require("./logger");

function normalizar(s) {
  return String(s || "").trim().toLowerCase().replace(/^@/, "");
}

async function resolverUsuario(alvo) {
  const t = normalizar(alvo);
  if (!t) return null;
  if (/^\d{17,19}$/.test(t)) {
    try {
      return await client.users.fetch(t);
    } catch {}
  }
  for (const guild of client.guilds.cache.values()) {
    const achar = (m) =>
      m.user.username.toLowerCase() === t ||
      (m.nickname && m.nickname.toLowerCase() === t) ||
      (m.user.globalName && m.user.globalName.toLowerCase() === t);
    let encontrado = guild.members.cache.find(achar);
    if (!encontrado) {
      try {
        await guild.members.fetch();
        encontrado = guild.members.cache.find(achar);
      } catch {
        continue;
      }
    }
    if (encontrado) return encontrado.user;
  }
  return null;
}

async function enviarDM(usuario, mensagem) {
  if (!mensagem) return { ok: false, erro: "mensagem é obrigatória" };
  if (!client.isReady()) return { ok: false, erro: "Discord ainda não conectou" };
  const user = await resolverUsuario(usuario);
  if (!user) return { ok: false, erro: `Não encontrei ninguém chamado "${usuario}" nos seus servidores` };
  try {
    await user.send(String(mensagem));
    log("INFO", "[DISCORD_MSG] DM enviada", { usuario: user.username });
    return { ok: true, usuario: user.username, id: user.id };
  } catch (err) {
    return { ok: false, erro: `Falhou enviar DM para ${user.username}: ${err.message}` };
  }
}

async function listarContatos() {
  if (!client.isReady()) return { ok: false, erro: "Discord ainda não conectou" };
  const contatos = new Map();
  for (const guild of client.guilds.cache.values()) {
    let membros;
    try {
      membros = await guild.members.fetch();
    } catch {
      continue;
    }
    for (const m of membros.values()) {
      if (m.user.bot) continue;
      const atual = contatos.get(m.id) || {
        id: m.id,
        username: m.user.username,
        nome: m.user.globalName || null,
        apelido: m.nickname || null,
        servidores: [],
      };
      atual.servidores.push(guild.name);
      contatos.set(m.id, atual);
    }
  }
  return { ok: true, total: contatos.size, contatos: [...contatos.values()] };
}

async function enviarCanal(servidor, canal, mensagem) {
  if (!mensagem) return { ok: false, erro: "mensagem é obrigatória" };
  if (!client.isReady()) return { ok: false, erro: "Discord ainda não conectou" };
  if (/^\d{17,19}$/.test(String(canal))) {
    try {
      const ch = await client.channels.fetch(canal);
      if (ch && ch.isTextBased()) {
        await ch.send(String(mensagem));
        return { ok: true, canal: ch.name ?? String(canal), servidor: ch.guild ? ch.guild.name : "DM" };
      }
    } catch {}
  }
  const sNome = normalizar(servidor);
  const cAlvo = normalizar(canal);
  for (const guild of client.guilds.cache.values()) {
    if (sNome && guild.name.toLowerCase() !== sNome) continue;
    let canais;
    try {
      canais = await guild.channels.fetch();
    } catch {
      continue;
    }
    const ch = canais.find((c) => c && c.isTextBased() && c.name.toLowerCase() === cAlvo);
    if (ch) {
      try {
        await ch.send(String(mensagem));
        log("INFO", "[DISCORD_MSG] Mensagem no canal", { canal: ch.name, servidor: guild.name });
        return { ok: true, canal: ch.name, servidor: guild.name };
      } catch (err) {
        return { ok: false, erro: err.message };
      }
    }
    if (sNome) break;
  }
  return { ok: false, erro: `Canal "${canal}" não encontrado${servidor ? ` no servidor "${servidor}"` : ""}` };
}

module.exports = { enviarDM, listarContatos, enviarCanal, resolverUsuario };
