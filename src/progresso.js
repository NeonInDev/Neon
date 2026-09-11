// Progresso em ações longas usando MENSAGENS EDITADAS.
// Envia uma mensagem placeholder e atualiza o conteúdo conforme o progresso,
// sem ficar enviando várias mensagens novas (não dá spam).

const { log } = require("./logger");

// Guarda os "manipuladores" de progresso por conversa, pra poder cancelar/atualizar.
const ativos = new Map();

// Cria um controlador de progresso.
// messageObj: a mensagem do usuário (precisa ser uma mensagem de canal).
// Se o canal não permitir editar (ex.: sem permissão), degrada pra um simples envio.
async function iniciar(messageObj, tituloInicial = "⏳ Processando...") {
  if (!messageObj || !messageObj.channel) return { ok: false, motivo: "sem_canal" };
  const chave = messageObj.author?.id;

  try {
    const placeholder = await messageObj.channel.send(`🔄 ${tituloInicial}`);
    const controlador = {
      message: placeholder,
      chave: `${chave}_${Date.now()}`,
      atualizado: 0,
      async atualizar(novoTexto, emoji = "🔄") {
        controlador.atualizado++;
        try {
          await controlador.message.edit(`${emoji} ${novoTexto}`);
        } catch (err) {
          log("WARN", "[PROGRESSO] Falha ao editar mensagem", { erro: err.message });
        }
      },
      async finalizar(textoFinal, emoji = "✅") {
        ativos.delete(chave);
        try {
          await controlador.message.edit(`${emoji} ${textoFinal}`);
        } catch (err) {
          log("WARN", "[PROGRESSO] Falha ao finalizar", { erro: err.message });
        }
      },
      async cancelar(motivo = "❌ Cancelado") {
        ativos.delete(chave);
        try {
          await controlador.message.edit(`🚫 ${motivo}`);
        } catch (err) {
          log("WARN", "[PROGRESSO] Falha ao cancelar", { erro: err.message });
        }
      },
    };
    if (ativos.has(chave)) ativos.delete(chave);
    ativos.set(chave, controlador);
    return {
      ok: true,
      atualizar: controlador.atualizar,
      finalizar: controlador.finalizar,
      cancelar: controlador.cancelar,
    };
  } catch (err) {
    log("WARN", "[PROGRESSO] Nao consegui enviar placeholder", { erro: err.message });
    return { ok: false, motivo: err.message };
  }
}

// Edita o placeholder em órbita (usado pela Neon pra mostrar "rodando comando...")
function atualizarExistente(chave, novoTexto, emoji = "🔄") {
  const c = ativos.get(chave);
  if (c) return c.atualizar(novoTexto, emoji);
  return Promise.resolve();
}

// Acha um controlador de progresso pela mensagem placeholder (a "mensagem da Neon").
function encontrarPorMsgId(messageId) {
  for (const c of ativos.values()) {
    if (c.message?.id === messageId) return c;
  }
  return null;
}

function isMsgIdProgresso(messageId) {
  return !!encontrarPorMsgId(messageId);
}

// Cancela (edita para "🚫 Cancelado") o placeholder cujo id é o informado.
function cancelarPorMsgId(messageId, motivo = "Cancelado") {
  const c = encontrarPorMsgId(messageId);
  if (c) return c.cancelar(motivo);
  return Promise.resolve();
}

module.exports = { iniciar, atualizarExistente, isMsgIdProgresso, cancelarPorMsgId };
