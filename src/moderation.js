function estaNaBlacklist(db, userId) {
  if (!db.data.blacklist) db.data.blacklist = [];
  return db.data.blacklist.includes(userId);
}

module.exports = { estaNaBlacklist };
