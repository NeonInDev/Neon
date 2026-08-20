const { log } = require("../src/logger");

module.exports = {
  nome: "Strava",
  versao: "0.1",
  desc: "Integracao com o Strava (ainda nao conectado). Planejado: importar atividades e mostras estatisticas de corrida/ciclismo.",

  async iniciar() {
    log("INFO", "[STRAVA] Plugin carregado, aguardando conexao da conta");
  },

  async parar() {
    log("INFO", "[STRAVA] Plugin parado");
  },

  ferramentas: [],

  acoes: [],
};