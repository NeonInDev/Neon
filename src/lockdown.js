// Sistema de Lockdown: remove todos os cargos, aplica um cargo bloqueador
// (ViewChannel negado em todos os canais) e restaura os cargos no release.
const fs = require("fs");
const path = require("path");
const { PermissionFlagsBits } = require("discord.js");
const { log } = require("./logger");

const ARQUIVO = path.join(__dirname, "..", "data", "lockdown.json");
const NOME_CARGO = "Lockdown";
const CANAIS_TIPOS = [0, 5, 2, 13]; // texto, noticias, voz, etapa

let cache = null;
const agendados = new Map(); // userId -> timeout

function carregar() {
  if (cache) return cache;
  try {
    if (!fs.existsSync(ARQUIVO)) {
      cache = { ativos: {} };
      return cache;
    }
    cache = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
    if (!cache.ativos) cache.ativos = {};
  } catch (err) {
    log("ERROR", "[LOCKDOWN] Falha ao carregar", { erro: err.message });
    cache = { ativos: {} };
  }
  return cache;
}

function persistir() {
  if (!fs.existsSync(path.dirname(ARQUIVO))) fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
  fs.writeFileSync(ARQUIVO, JSON.stringify(cache, null, 2), "utf8");
}

function acharCargoLockdown(guild) {
  return guild.roles.cache.find((r) => r.name === NOME_CARGO) || null;
}

async function garantirCargoLockdown(guild) {
  let cargo = acharCargoLockdown(guild);
  if (!cargo) {
    cargo = await guild.roles.create({
      name: NOME_CARGO,
      color: 0x000000,
      hoist: false,
      mentionable: false,
      reason: "Cargo de lockdown criado pela Neon",
      permissions: [],
    });
    log("INFO", "[LOCKDOWN] Cargo criado", { guild: guild.name });
  }
  const mega = guild.members.me?.roles.highest?.position || 1;
  if (cargo.position >= mega - 1) {
    await cargo.setPosition(Math.max(1, mega - 2)).catch(() => {});
  }
  return cargo;
}

// nega ViewChannel do cargo Lockdown em todos os canais
async function aplicarCargoNosCanais(guild, cargo) {
  const canais = guild.channels.cache.filter((c) => CANAIS_TIPOS.includes(c.type));
  let n = 0;
  for (const canal of canais.values()) {
    if (!canal.manageable) continue;
    await canal.permissionOverwrites
      .edit(cargo, { ViewChannel: false })
      .then(() => (n += 1))
      .catch(() => {});
  }
  return n;
}

// remove o overwrite do cargo Lockdown nos canais (pra nao deixar lixo)
async function limparCargoDosCanais(guild, cargo) {
  const canais = guild.channels.cache.filter((c) => CANAIS_TIPOS.includes(c.type));
  for (const canal of canais.values()) {
    if (!canal.manageable) continue;
    await canal.permissionOverwrites.delete(cargo).catch(() => {});
  }
}

async function ativaLockdown(member, motivo, expiraEm = null) {
  const d = carregar();
  const existente = d.ativos[member.id];
  if (existente) {
    return { ok: false, erro: "Esse usuário já está em lockdown. Use /deslockdown antes." };
  }
  if (member.id === member.guild.ownerId) {
    return { ok: false, erro: "Não posso dar lockdown no dono do servidor." };
  }
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return { ok: false, erro: "Não posso dar lockdown em alguém com permissão de Administrador." };
  }

  const cargo = await garantirCargoLockdown(member.guild);
  const canaisAfetados = await aplicarCargoNosCanais(member.guild, cargo);

  const cargosSalvos = member.roles.cache
    .filter((r) => r.id !== member.guild.id)
    .map((r) => r.id);

  // remove todos os cargos
  for (const roleId of cargosSalvos) {
    await member.roles.remove(roleId).catch(() => {});
  }
  await member.roles.add(cargo).catch(() => {});

  d.ativos[member.id] = {
    guildId: member.guild.id,
    cargos: cargosSalvos,
    motivo: motivo || "",
    canaisAfetados,
    aplicadoEm: Date.now(),
    expiraEm: expiraEm || null,
  };
  persistir();

  if (expiraEm) agendarRelease(member.guild, member.id, expiraEm);

  log("INFO", "[LOCKDOWN] Ativado", { usuario: member.user.tag, guild: member.guild.name, canaisAfetados });
  return { ok: true, cargo: cargo.name, canaisAfetados, cargosSalvos: cargosSalvos.length };
}

async function desativaLockdown(guild, userId) {
  const d = carregar();
  const reg = d.ativos[userId];
  if (!reg) {
    return { ok: false, erro: "Esse usuário não está em lockdown." };
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) {
    const cargo = acharCargoLockdown(guild);
    if (cargo && member.roles.cache.has(cargo.id)) {
      await member.roles.remove(cargo).catch(() => {});
    }
    for (const roleId of reg.cargos) {
      await member.roles.add(roleId).catch(() => {});
    }
    if (cargo) await limparCargoDosCanais(guild, cargo);
  }

  delete d.ativos[userId];
  persistir();
  cancelarRelease(userId);
  log("INFO", "[LOCKDOWN] Desativado", { usuario: userId, guild: guild.name });
  return { ok: true, cargosRestaurados: (member ? reg.cargos.length + (cargo ? 1 : 0) : reg.cargos.length) };
}

function listarAtivos() {
  return Object.entries(carregar().ativos).map(([id, r]) => ({ id, ...r }));
}

function agendarRelease(guild, userId, expiraEm) {
  cancelarRelease(userId);
  const delay = Math.max(0, expiraEm - Date.now());
  agendados.set(
    userId,
    setTimeout(async () => {
      const d = carregar();
      if (d.ativos[userId]) {
        const res = await desativaLockdown(guild, userId);
        const membro = await guild.members.fetch(userId).catch(() => null);
        log("INFO", "[LOCKDOWN] Liberado automaticamente", { usuario: userId, ok: res.ok });
      }
      agendados.delete(userId);
    }, delay)
  );
  agendados.get(userId).unref?.();
}

function cancelarRelease(userId) {
  const t = agendados.get(userId);
  if (t) {
    clearTimeout(t);
    agendados.delete(userId);
  }
}

module.exports = { ativaLockdown, desativaLockdown, listarAtivos, garantirCargoLockdown };
