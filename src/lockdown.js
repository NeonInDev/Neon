// =============================================================
// SISTEMA DE LOCKDOWN - REMOCAO TEMPORARIA DE CARGOS
// -------------------------------------------------------------
// REGRA DE OURO: o lockdown REMOVE os cargos so TEMPORARIAMENTE.
// O /unlockdown (ou o release automatico) DEVOLVE EXATAMENTE os
// mesmos cargos salvos, restaurando tambem as permissoes que vem
// deles. NENHUM cargo e perdido de forma permanente.
//
// Fluxo:
//  1. ativaLockdown()  -> salva a lista completa de cargos
//     ({id, nome}) em data/lockdown.json, remove todos e aplica o
//     cargo "Lockdown" (ViewChannel negado em todos os canais).
//  2. desativaLockdown() -> remove o cargo "Lockdown", limpa os
//     overwrites dos canais e DEVOLVE cada cargo salvo.
//     Se algum cargo tiver sido deletado durante o lockdown, ele e
//     RECRIADO pelo nome para que nada fique perdido.
// =============================================================
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
  // garante que o cargo Lockdown fique ABAIXO do cargo mais alto do bot
  const mega = guild.members.me?.roles.highest?.position || 1;
  if (cargo.position >= mega - 1) {
    await cargo.setPosition(Math.max(1, mega - 2)).catch(() => {});
  }
  return cargo;
}

// nega ViewChannel do cargo Lockdown em todos os canais (bloqueia a visao dos chats)
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

// remove o overwrite do cargo Lockdown nos canais (restaura a visao normalmente)
async function limparCargoDosCanais(guild, cargo) {
  const canais = guild.channels.cache.filter((c) => CANAIS_TIPOS.includes(c.type));
  let n = 0;
  for (const canal of canais.values()) {
    if (!canal.manageable) continue;
    const ok = await canal.permissionOverwrites
      .delete(cargo)
      .then(() => true)
      .catch(() => false);
    if (ok) n += 1;
  }
  return n;
}

// =============================================================
// REMOCAO TEMPORARIA: salva cargos, remove-os e aplica o bloqueio
// =============================================================
async function ativaLockdown(member, motivo, expiraEm = null) {
  const d = carregar();
  if (d.ativos[member.id]) {
    return { ok: false, erro: "Esse usuário já está em lockdown. Use /unlockdown antes." };
  }
  if (member.id === member.guild.ownerId) {
    return { ok: false, erro: "Não posso dar lockdown no dono do servidor." };
  }
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return { ok: false, erro: "Não posso dar lockdown em alguém com permissão de Administrador." };
  }

  const cargo = await garantirCargoLockdown(member.guild);
  const canaisAfetados = await aplicarCargoNosCanais(member.guild, cargo);

  // SALVA TODOS OS CARGOS (com nome, p/ recriar se deletarem durante o lockdown)
  const cargosSalvos = member.roles.cache
    .filter((r) => r.id !== member.guild.id) // exclui @everyone (sempre existe)
    .map((r) => ({ id: r.id, nome: r.name }));

  // remove TODOS os cargos (temporariamente)
  for (const r of cargosSalvos) {
    await member.roles.remove(r.id).catch(() => {});
  }
  await member.roles.add(cargo).catch(() => {});

  // persistir ANTES de agendar: se o bot reiniciar, o registro sobrevive
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

  log("INFO", "[LOCKDOWN] Ativado (remocao temporaria)", {
    usuario: member.user.tag,
    guild: member.guild.name,
    canaisAfetados,
    cargosSalvos: cargosSalvos.length,
  });
  return { ok: true, cargo: cargo.name, canaisAfetados, cargosSalvos: cargosSalvos.length };
}

// =============================================================
// DEVOLUCAO: re-adiciona TODOS os cargos salvos + limpa bloqueio
// =============================================================
async function desativaLockdown(guild, userId) {
  const d = carregar();
  const reg = d.ativos[userId];
  if (!reg) {
    return { ok: false, erro: "Esse usuário não está em lockdown." };
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  let restaurados = 0;
  let recriados = 0;
  let falhas = [];

  if (member) {
    // 1) remove o cargo de bloqueio
    const cargo = acharCargoLockdown(guild);
    if (cargo && member.roles.cache.has(cargo.id)) {
      await member.roles.remove(cargo).catch(() => {});
    }

    // 2) DEVOLVE TODOS OS CARGOS salvos (e, junto, todas as permissoes deles)
    for (const item of reg.cargos || []) {
      const rid = typeof item === "string" ? item : item.id;
      const rnome = typeof item === "string" ? null : item.nome;
      let role = guild.roles.cache.get(rid);
      if (!role) {
        // cargo foi DELETADO durante o lockdown -> recria pelo nome pra nao perder
        try {
          role = await guild.roles.create({ name: rnome || `cargo-${rid}`, permissions: [], reason: "Restaurado pela Neon" });
          recriados += 1;
        } catch {
          falhas.push(rid);
          continue;
        }
      }
      const adicionado = await member.roles.add(role).then(() => true).catch(() => false);
      if (adicionado) restaurados += 1;
      else falhas.push(rid);
    }

    // 3) remove os overwrites do cargo de bloqueio (volta a visao normal)
    if (cargo) await limparCargoDosCanais(guild, cargo);
  } else {
    // membro saiu do servidor durante o lockdown; cargos nao podem ser aplicados
    restaurados = reg.cargos?.length || 0;
  }

  delete d.ativos[userId];
  persistir();
  cancelarRelease(userId);

  log("INFO", "[LOCKDOWN] Desativado (cargos devolvidos)", {
    usuario: userId,
    guild: guild.name,
    restaurados,
    recriados,
    falhas: falhas.length ? falhas : undefined,
  });
  return { ok: true, cargosRestaurados: restaurados, cargosRecriados: recriados, falhas };
}

function listarAtivos() {
  return Object.entries(carregar().ativos).map(([id, r]) => ({ id, ...r }));
}

// release automatico por tempo (tambem devolve cargos via desativaLockdown)
function agendarRelease(guild, userId, expiraEm) {
  cancelarRelease(userId);
  const delay = Math.max(0, expiraEm - Date.now());
  agendados.set(
    userId,
    setTimeout(async () => {
      const d = carregar();
      if (d.ativos[userId]) {
        const res = await desativaLockdown(guild, userId);
        log("INFO", "[LOCKDOWN] Liberado automaticamente (cargos devolvidos)", {
          usuario: userId,
          cargosRestaurados: res.cargosRestaurados,
          recriados: res.cargosRecriados,
        });
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
