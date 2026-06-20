const path = require("path");
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");

const adapter = new JSONFile(path.join(__dirname, "..", "memory.json"));

const db = new Low(adapter, {
  users: {},
});

async function initDB() {
  await db.read();
  if (!db.data) db.data = { users: {} };
  await db.write();
}

module.exports = { db, initDB };
