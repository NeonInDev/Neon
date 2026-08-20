const { log } = require("../src/logger");

module.exports = {
  nome: "Medal",
  versao: "0.1",
  desc: "Integracao com o Medal (clipes de jogos). Planejado: buscar clipes recentes e gerar resumos.",

  async iniciar() {
    log("INFO", "[MEDAL] Plugin carregado, aguardando credenciais");
  },

  async parar() {
    log("INFO", "[MEDAL] Plugin parado");
  },

  ferramentas: [],

  acoes: [],
};