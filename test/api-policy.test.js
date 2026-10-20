"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { isRotaAtiva } = require("../src/api-policy");

test("mantém API central, visão e voz", () => {
  assert.equal(isRotaAtiva("POST", "/api/chat"), true);
  assert.equal(isRotaAtiva("POST", "/api/visao"), true);
  assert.equal(isRotaAtiva("POST", "/api/voz/stt"), true);
});

test("mantém apenas as rotas de jogo aprovadas na Steam", () => {
  assert.equal(isRotaAtiva("GET", "/api/jogos/steam/buscar?q=Portal"), true);
  assert.equal(isRotaAtiva("POST", "/api/jogos/steam/instalar"), true);
  assert.equal(isRotaAtiva("POST", "/api/jogos/steam/desinstalar"), true);
  assert.equal(isRotaAtiva("POST", "/api/jogos/hydra/instalar"), false);
});

test("desativa superfícies de API fora do escopo solicitado", () => {
  assert.equal(isRotaAtiva("POST", "/api/whatsapp/enviar"), false);
  assert.equal(isRotaAtiva("POST", "/api/discord/clone"), false);
  assert.equal(isRotaAtiva("POST", "/api/celular/abrir"), false);
});

test("mantém compatibilidade com a rota de chat por sessão", () => {
  assert.equal(isRotaAtiva("POST", "/session/test-session/message"), true);
  assert.equal(isRotaAtiva("POST", "/session/test/session/message"), false);
});
