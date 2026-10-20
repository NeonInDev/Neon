"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { detectarCategoria } = require("../src/actions");

test("preserva o roteamento de comandos de música do Spotify", () => {
  assert.equal(detectarCategoria("toca Viva La Vida Coldplay"), "spotify");
  assert.equal(detectarCategoria("pausa a música"), "spotify_control");
});

test("preserva o roteamento de comandos de vídeo do YouTube", () => {
  assert.equal(
    detectarCategoria("coloca Never Gonna Give You Up no YouTube"),
    "youtube"
  );
});

test("preserva os comandos de fala e ativação do microfone", () => {
  assert.equal(detectarCategoria("fala oi"), "tts");
  assert.equal(detectarCategoria("ativa o microfone"), "voiceToggle");
});
