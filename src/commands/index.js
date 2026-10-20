const { readdirSync } = require("fs");
const { join } = require("path");
const { comandoAtivo } = require("../feature-policy");

const commands = new Map();
const files = readdirSync(__dirname).filter((f) => {
  if (!f.endsWith(".js") || f === "index.js") return false;
  const nome = f.slice(0, -3);
  return comandoAtivo(nome);
});

for (const file of files) {
  const cmd = require(join(__dirname, file));
  commands.set(cmd.data.name, cmd);
}

module.exports = commands;
