const path = require("path");
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");

const adapter = new JSONFile(path.join(__dirname, "..", "memory.json"));

const db = new Low(adapter, {
  users: {},
  historico: {},
});

async function initDB() {
  await db.read();
  if (!db.data) db.data = { users: {}, historico: {} };
  if (!db.data.historico) db.data.historico = {};
  await db.write();
}

module.exports = { db, initDB };
