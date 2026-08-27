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
      } catch (err) {
        log("WARN", "[DISCORD_MSG] members.fetch falhou", { guild: guild.name, erro: err.message });
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
    } catch (err) {
      log("WARN", "[DISCORD_MSG] listarContatos: fetch falhou", { guild: guild.name, erro: err.message });
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

// ---------- Copiador de canal (origem -> destino) ----------

const copias = new Map();
let copiaSeq = 0;

function normalizarLocal(s) {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolverCanal(servidor, canal) {
  const sAlvo = servidor ? normalizarLocal(servidor) : null;
  const cAlvo = normalizarLocal(canal);
  for (const guild of client.guilds.cache.values()) {
    if (sAlvo && normalizarLocal(guild.name) !== sAlvo) continue;
    const ch = guild.channels.cache.find((c) => c && c.isTextBased() && !c.isThread() && normalizarLocal(c.name) === cAlvo);
    if (ch) return ch;
  }
  return null;
}

function iniciarCopia({ canalOrigem, servidorOrigem, canalDestino, servidorDestino, limite }) {
  const id = ++copiaSeq;
  const estado = {
    id,
    status: "iniciando",
    canalOrigem,
    canalDestino,
    enviadas: 0,
    imagens: 0,
    erros: 0,
    totalAprox: 0,
    iniciadaEm: new Date().toISOString(),
    terminadaEm: null,
    erro: null,
  };
  copias.set(id, estado);
  rodarCopia(estado, { canalOrigem, servidorOrigem, canalDestino, servidorDestino, limite }).catch((err) => {
    estado.status = "erro";
    estado.erro = err.message;
    estado.terminadaEm = new Date().toISOString();
    log("ERROR", "[COPIA] Falhou", { id, erro: err.message });
  });
  return { ok: true, id };
}

async function rodarCopia(estado, { canalOrigem, servidorOrigem, canalDestino, servidorDestino, limite }) {
  const origem = resolverCanal(servidorOrigem, canalOrigem);
  if (!origem) throw new Error(`Canal de origem "${canalOrigem}" não encontrado${servidorOrigem ? ` em "${servidorOrigem}"` : ""}`);
  const destino = resolverCanal(servidorDestino, canalDestino);
  if (!destino) throw new Error(`Canal de destino "${canalDestino}" não encontrado${servidorDestino ? ` em "${servidorDestino}"` : ""}`);

  log("INFO", "[COPIA] Iniciando", { id: estado.id, origem: `${origem.guild.name}#${origem.name}`, destino: `${destino.guild.name}#${destino.name}` });
  estado.status = "copiando";

  const MAX = Number(limite) || Infinity;
  let before = null;
  let coletadas = [];

  while (coletadas.length < MAX) {
    const opts = { limit: 100 };
    if (before) opts.before = before;
    const lote = await origem.messages.fetch(opts);
    if (!lote.size) break;
    for (const m of lote.values()) coletadas.push(m);
    before = lote.last().id;
    if (lote.size < 100) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  if (coletadas.length > MAX) coletadas = coletadas.slice(0, MAX);
  coletadas.reverse(); // mais antigas primeiro
  estado.totalAprox = coletadas.length;
  log("INFO", "[COPIA] Historico coletado", { id: estado.id, mensagens: coletadas.length });

  for (const m of coletadas) {
    try {
      const dataHora = `<t:${Math.floor(m.createdTimestamp / 1000)}:d>`;
      const autor = m.author.bot ? `${m.author.username} (bot)` : m.author.username;
      const partes = [];
      const texto = [m.content, m.embeds.length && !m.content ? "_(embed não copiado)_" : ""]
        .filter(Boolean).join("\n").trim();
      if (texto) partes.push(`**${autor}** · ${dataHora}\n${texto}`);
      else if (m.attachments.size) partes.push(`**${autor}** · ${dataHora}`);

      const arquivos = [];
      for (const a of m.attachments.values()) {
        try {
          const resp = await fetch(a.url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const buf = Buffer.from(await resp.arrayBuffer());
          arquivos.push({ attachment: buf, name: a.name });
          if (a.contentType && a.contentType.startsWith("image/")) estado.imagens++;
        } catch (err) {
          estado.erros++;
          log("WARN", "[COPIA] Anexo falhou", { id: estado.id, url: a.url.slice(0, 80), erro: err.message });
        }
      }

      const payload = { files: arquivos };
      if (partes.length) payload.content = partes.join("\n\n").slice(0, 1950);
      else if (!arquivos.length) continue; // nada pra copiar nessa
      await destino.send(payload);
      estado.enviadas++;
    } catch (err) {
      estado.erros++;
      log("WARN", "[COPIA] Mensagem falhou", { id: estado.id, msgId: m.id, erro: err.message });
    }
    if (estado.enviadas % 25 === 0) {
      log("INFO", "[COPIA] Progresso", { id: estado.id, enviadas: estado.enviadas, total: coletadas.length });
      await new Promise((r) => setTimeout(r, 1500));
    } else {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  estado.status = "concluida";
  estado.terminadaEm = new Date().toISOString();
  log("INFO", "[COPIA] Concluida", { id: estado.id, enviadas: estado.enviadas, imagens: estado.imagens, erros: estado.erros });
}

function statusCopia(id) {
  if (id == null) return Array.from(copias.values()).sort((a, b) => b.id - a.id).slice(0, 5);
  return copias.get(Number(id)) || null;
}

module.exports = { enviarDM, listarContatos, enviarCanal, resolverUsuario, iniciarCopia, statusCopia };
