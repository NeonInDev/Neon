"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { executarFerramenta, extrairFerramentas } = require("../src/tools-core");

test("mantém a ferramenta OpenCode e rejeita ferramentas legadas com erro explícito", async () => {
  assert.deepEqual(extrairFerramentas("FERRAMENTA: codar | pesquisa web sobre Node"), [
    { nome: "codar", args: "pesquisa web sobre Node" },
  ]);
  assert.match(
    await executarFerramenta({ nome: "whatsapp_enviar", args: "mensagem=oi" }),
    /Ferramenta desativada/
  );
});
