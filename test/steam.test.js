"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const pc = require("../src/pc");

test("não aceita AppIDs inválidos nas ações de instalação e desinstalação", async () => {
  assert.equal((await pc.instalarJogoSteam("1; shutdown")).ok, false);
  assert.equal((await pc.desinstalarJogoSteam("../1")).ok, false);
});
