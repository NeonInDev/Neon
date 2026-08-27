const { log } = require("../src/logger");

module.exports = {
  nome: "Exemplo",
  versao: "1.1",
  desc: "Plugin de exemplo — template pra criar novos plugins.",

  async iniciar() {
    log("INFO", "[EXEMPLO] Plugin de exemplo ativo!");
  },

  async parar() {
    log("INFO", "[EXEMPLO] Plugin de exemplo parado");
  },

  ferramentas: [
    {
      nome: "exemplo_ola",
      desc: "Plugin exemplo: retorna uma saudação. Uso: exemplo_ola | [nome]",
      async executar(args) {
        const nome = args || "mundo";
        return `Olá, ${nome}! (do plugin Exemplo)`;
      }
    }
  ],

  acoes: [
    {
      padrao: /^(teste|testar)\s+plugin/i,
      async executar(texto, userId) {
        return "Plugin de exemplo funcionando perfeitamente!";
      }
    }
  ]
};
