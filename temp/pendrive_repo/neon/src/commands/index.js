const { readdirSync } = require("fs");
const { join } = require("path");

const commands = new Map();
const files = readdirSync(__dirname).filter((f) => f.endsWith(".js") && f !== "index.js");

for (const file of files) {
  const cmd = require(join(__dirname, file));
  commands.set(cmd.data.name, cmd);
}

module.exports = commands;
