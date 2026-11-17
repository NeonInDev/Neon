"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { Collection } = require("discord.js");

// arquivos de teste separados dos de produção
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "neon-protocolo-"));
process.env.PROTOCOLO_EMILIA_ARQ = path.join(TMP, "emilia.json");
process.env.PROTOCOLO_BACKUPS_DIR = path.join(TMP, "backups");

const protocolos = require("../src/protocolos");
const { comandoAtivo, comandoGlobal, comandoSoGuild } = require("../src/feature-policy");

test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

test("duração da Emilia entende minutos, horas, dias e semanas", () => {
  assert.equal(protocolos.duracaoDe("30m"), 30);
  assert.equal(protocolos.duracaoDe("2h"), 120);
  assert.equal(protocolos.duracaoDe("7d"), 10080);
  assert.equal(protocolos.duracaoDe("3s"), 30240);
  assert.equal(protocolos.duracaoDe("permanente"), null);
  assert.equal(protocolos.duracaoDe(""), null);
  assert.equal(protocolos.duracaoDe("abc"), undefined);
  assert.equal(protocolos.duracaoDe("0m"), undefined);
  assert.equal(protocolos.duracaoDe("999d"), undefined); // passa de 1 ano
});

test("/protocolo está ativo, é só de servidor e não vai no deploy global", () => {
  assert.equal(comandoAtivo("protocolo"), true);
  assert.equal(comandoSoGuild("protocolo"), true);
  assert.equal(comandoGlobal("protocolo"), false);
});

test("o comando declara os três protocolos", () => {
  const cmd = require("../src/commands/protocolo");
  const subs = cmd.data.toJSON().options.map((o) => o.name);
  for (const s of ["thanos", "tony", "emilia", "emilia_restaurar", "emilia_listar"]) {
    assert.ok(subs.includes(s), `subcomando ${s} ausente`);
  }
  assert.equal(cmd.donoOnly, true);
});

function cargoFalso(id, nome, alto = false) {
  return {
    id,
    name: nome,
    managed: false,
    permissions: { has: () => false },
    comparePositionTo: () => (alto ? -1 : 1),
  };
}

function montarGuild() {
  const cargos = new Map([
    ["r1", cargoFalso("r1", "Staff")],
    ["r2", cargoFalso("r2", "Membro")],
  ]);
  const adicionados = [];
  const membro = {
    id: "u1",
    user: { tag: "alvo#0001" },
    manageable: true,
    roles: {
      cache: new Map([
        ["r1", cargos.get("r1")],
        ["r2", cargos.get("r2")],
      ]),
      set: async () => {},
      add: async (cargo) => adicionados.push(cargo.id),
    },
  };
  const guild = {
    id: "g1",
    name: "Servidor Teste",
    ownerId: "dono-do-servidor",
    client: { user: { id: "bot" }, isReady: () => false },
    members: {
      me: {
        permissions: { has: () => true },
        roles: { highest: { comparePositionTo: () => 1 } },
      },
      fetch: async () => membro,
    },
    roles: { cache: cargos, fetch: async (id) => cargos.get(id) || null },
  };
  return { guild, membro, cargos, adicionados };
}

test("Emilia guarda os cargos, retira e devolve", async () => {
  const { guild, adicionados, cargos } = montarGuild();

  const r = await protocolos.emilia(guild, "u1", {
    duracao: 60,
    motivo: "teste",
    autor: { id: "dono", tag: "dono#0001" },
  });
  assert.equal(r.ok, true, r.erro);
  assert.equal(r.cargos.length, 2);
  assert.ok(r.expiraEm > Date.now() + 55 * 60000, "deve vencer em ~1h");

  const salvo = JSON.parse(fs.readFileSync(process.env.PROTOCOLO_EMILIA_ARQ, "utf8"));
  const reg = salvo["g1:u1"];
  assert.ok(reg, "registro não foi salvo");
  assert.deepEqual(reg.cargos.map((c) => c.id).sort(), ["r1", "r2"]);
  assert.equal(reg.autorId, "dono");

  const volta = await protocolos.restaurar(guild, "u1", { motivo: "teste" });
  assert.equal(volta.ok, true, volta.erro);
  assert.deepEqual(adicionados.sort(), ["r1", "r2"]);
  assert.equal(volta.falharam.length, 0);

  const depois = JSON.parse(fs.readFileSync(process.env.PROTOCOLO_EMILIA_ARQ, "utf8"));
  assert.equal(depois["g1:u1"], undefined, "registro deveria ter sido apagado");

  assert.equal(cargos.size, 2);
});

test("Emilia recusa o dono do servidor e quem não tem cargo", async () => {
  const { guild } = montarGuild();
  const dono = await protocolos.emilia({ ...guild, ownerId: "u1" }, "u1", {});
  assert.equal(dono.ok, false);
  assert.match(dono.erro, /dono do servidor/);

  const semCargo = montarGuild();
  semCargo.membro.roles.cache.clear();
  const r = await protocolos.emilia(semCargo.guild, "u1", {});
  assert.equal(r.ok, false);
  assert.match(r.erro, /nenhum cargo/);
});

function paginaDe(mensagens) {
  const col = new Collection();
  for (const m of mensagens) col.set(m.id, m);
  return col;
}

function mensagemFalsa(id, autorId, idadeDias = 0) {
  return {
    id,
    author: { id: autorId },
    createdTimestamp: Date.now() - idadeDias * 86400000,
    createdAt: new Date(),
    editedAt: null,
    content: "oi",
    attachments: new Collection(),
    reference: null,
    pinned: false,
    deletable: true,
    delete: async () => {},
  };
}

function canalFalso(mensagens) {
  let chamadas = 0;
  return {
    id: "c1",
    name: "geral",
    type: 0,
    rawPosition: 1,
    isTextBased: () => true,
    isDMBased: () => false,
    isThread: () => false,
    permissionsFor: () => ({ has: () => true }),
    messages: {
      fetch: async () => {
        chamadas++;
        return chamadas === 1 ? paginaDe(mensagens) : paginaDe([]);
      },
    },
    bulkDelete: async (lista) => paginaDe(lista),
  };
}

function guildComCanais(canais) {
  return {
    id: "g1",
    name: "Servidor Teste",
    client: { user: { id: "bot" } },
    channels: { cache: new Map(canais.map((c) => [c.id, c])) },
    members: { me: { permissions: { has: () => true } } },
    roles: { cache: new Map() },
  };
}

test("Thanos apaga só as mensagens do alvo", async () => {
  const alvo = mensagemFalsa("m1", "u1");
  const outro = mensagemFalsa("m2", "u2");
  const velha = mensagemFalsa("m3", "u1", 40);
  const canal = canalFalso([alvo, outro, velha]);
  const guild = guildComCanais([canal]);

  const r = await protocolos.thanos(guild, "u1", { dias: 30 });
  assert.equal(r.ok, true, r.erro);
  assert.equal(r.apagadas, 1, "só a mensagem recente do alvo deve sair");
  assert.equal(r.achadas, 1, "a de 40 dias fica fora da janela de 30");

  // canal novo: o falso só entrega a primeira página uma vez
  const canal2 = canalFalso([mensagemFalsa("m1", "u1"), mensagemFalsa("m2", "u2"), velha]);
  const tudo = await protocolos.thanos(guildComCanais([canal2]), "u1", { dias: 0 });
  assert.equal(tudo.apagadas, 2, "sem janela, pega a antiga também");
});

test("Tony salva as mensagens em JSON", async () => {
  const canal = canalFalso([mensagemFalsa("m1", "u1"), mensagemFalsa("m2", "u2")]);
  const guild = guildComCanais([canal]);

  const r = await protocolos.tony(guild, { limitePorCanal: 10 });
  assert.equal(r.ok, true, r.erro);
  assert.equal(r.total, 2);

  const backup = JSON.parse(fs.readFileSync(r.arquivo, "utf8"));
  assert.equal(backup.protocolo, "tony");
  assert.equal(backup.totalMensagens, 2);
  assert.equal(backup.canais[0].mensagens[0].autorId, "u1");
  assert.ok(fs.existsSync(r.arquivo));
});
