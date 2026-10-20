"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { acaoAtiva, comandoAtivo } = require("../src/feature-policy");

test("mantém os comandos principais e de lazer", () => {
  for (const nome of ["neon", "saude", "spotify", "youtube", "letra", "ping", "sair"]) {
    assert.equal(comandoAtivo(nome), true, `${nome} deve continuar ativo`);
  }
  for (const nome of ["google", "whatsapp", "mod", "gravar", "rpg"]) {
    assert.equal(comandoAtivo(nome), false, `${nome} deve ficar desativado`);
  }
});

test("restringe ações naturais às categorias preservadas e instalação Steam", () => {
  assert.equal(acaoAtiva("spotify", "toca música"), true);
  assert.equal(acaoAtiva("tts", "fala oi"), true);
  assert.equal(acaoAtiva("voiceToggle", "ativa o microfone"), true);
  assert.equal(acaoAtiva(null, "instalar Portal 2 pela Steam"), true);
  assert.equal(acaoAtiva("whatsapp", "manda zap"), false);
  assert.equal(acaoAtiva("exec", "executa comando"), false);
});
