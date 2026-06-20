function criarPerfil() {
  return { gostos: [], personalidade: [], observacoes: [] };
}

function getOrCreateUser(db, userId, username) {
  if (!db.data.users) db.data.users = {};
  if (!db.data.users[userId]) {
    db.data.users[userId] = {
      id: userId,
      username,
      afinidade: 0,
      mestre: false,
      historico: [],
      perfil: criarPerfil(),
    };
  }
  if (!db.data.users[userId].perfil) db.data.users[userId].perfil = criarPerfil();
  return db.data.users[userId];
}

module.exports = { getOrCreateUser };
