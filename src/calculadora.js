"use strict";

// Avaliador aritmético pequeno e determinístico. Não usa eval/Function para que
// expressões recebidas por chat jamais possam executar JavaScript.
function calcularExpressao(entrada) {
  const texto = String(entrada || "").trim();
  if (!texto || texto.length > 120 || !/^[\d\s+\-*/%.(),]+$/.test(texto)) {
    throw new Error("expressão inválida");
  }

  const tokens = texto.replace(/,/g, ".").match(/\d+(?:\.\d+)?|[()+\-*/%]/g);
  if (!tokens || tokens.join("") !== texto.replace(/[\s,]/g, "").replace(/,/g, ".")) {
    throw new Error("expressão inválida");
  }

  let posicao = 0;
  const proximo = () => tokens[posicao];
  const consumir = () => tokens[posicao++];

  function primario() {
    const token = consumir();
    if (token === "(") {
      const valor = soma();
      if (consumir() !== ")") throw new Error("parênteses inválidos");
      return valor;
    }
    if (/^\d/.test(token || "")) return Number(token);
    throw new Error("número esperado");
  }

  function unario() {
    if (proximo() === "+") { consumir(); return unario(); }
    if (proximo() === "-") { consumir(); return -unario(); }
    return primario();
  }

  function produto() {
    let valor = unario();
    while (["*", "/", "%"].includes(proximo())) {
      const operador = consumir();
      const direito = unario();
      if ((operador === "/" || operador === "%") && direito === 0) throw new Error("divisão por zero");
      valor = operador === "*" ? valor * direito : operador === "/" ? valor / direito : valor % direito;
    }
    return valor;
  }

  function soma() {
    let valor = produto();
    while (["+", "-"].includes(proximo())) {
      valor = consumir() === "+" ? valor + produto() : valor - produto();
    }
    return valor;
  }

  const resultado = soma();
  if (posicao !== tokens.length || !Number.isFinite(resultado)) throw new Error("resultado inválido");
  return resultado;
}

module.exports = { calcularExpressao };
