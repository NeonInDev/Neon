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
    };
    if (ativos.has(chave)) ativos.delete(chave);
    ativos.set(chave, controlador);
    return {
      ok: true,
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

module.exports = { iniciar, atualizarExistente };
