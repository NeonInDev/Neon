const { log } = require("./logger")

// Uma tarefa que nunca resolve segura `processing` em true e trava a fila
// daquele usuario para sempre: ele continua falando e a Neon cala, sem erro
// no log. O timeout abaixo e o que impede isso. Precisa ser MAIOR que o
// tempo maximo que a IA pode levar (ver avisarAtraso em messageCreate.js).
const TIMEOUT_MS = Number(process.env.FILA_TIMEOUT_MS) || 6 * 60 * 1000

const filas = new Map()

function comTimeout(taskFn, userId) {
  let timer
  const limite = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const seg = TIMEOUT_MS >= 1000 ? `${Math.round(TIMEOUT_MS / 1000)}s` : `${TIMEOUT_MS}ms`
      reject(new Error(`tarefa travou por mais de ${seg}`))
    }, TIMEOUT_MS)
  })
  return Promise.race([taskFn(), limite]).finally(() => clearTimeout(timer))
}

function enfileirar(userId, taskFn) {
  return new Promise((resolve, reject) => {
    if (!filas.has(userId)) {
      filas.set(userId, { queue: [], processing: false })
    }
    const fila = filas.get(userId)
    fila.queue.push({ taskFn, resolve, reject })
    log("DEBUG", "[FILA] Tarefa enfileirada", { userId, tamanho: fila.queue.length })
    if (!fila.processing) processarProxima(userId)
  })
}

async function processarProxima(userId) {
  const fila = filas.get(userId)
  if (!fila || fila.queue.length === 0) {
    if (fila) fila.processing = false
    return
  }
  fila.processing = true
  const { taskFn, resolve, reject } = fila.queue.shift()
  log("DEBUG", "[FILA] Processando tarefa", { userId, restante: fila.queue.length })
  const inicio = Date.now()
  try {
    const resultado = await comTimeout(taskFn, userId)
    resolve(resultado)
  } catch (err) {
    log("WARN", "[FILA] tarefa falhou ou travou, liberando a fila", {
      userId,
      ms: Date.now() - inicio,
      erro: err.message,
    })
    reject(err)
  } finally {
    // precisa rodar mesmo com erro: se nao rodar, a fila morre aqui
    processarProxima(userId)
  }
}

function status(userId) {
  const chaves = [...filas.keys()].filter((k) => k === userId || String(k).startsWith(`${userId}:`));
  let queueLength = 0;
  let processing = false;
  for (const chave of chaves) {
    const fila = filas.get(chave);
    if (fila) {
      queueLength += fila.queue.length;
      processing = processing || fila.processing;
    }
  }
  return { queueLength, processing };
}

function listar() {
  const resultado = []
  for (const [userId, fila] of filas) {
    if (fila.queue.length > 0 || fila.processing) {
      resultado.push({ userId, queueLength: fila.queue.length, processing: fila.processing })
    }
  }
  return resultado
}

function limpar(userId) {
  const chaves = [...filas.keys()].filter((k) => k === userId || String(k).startsWith(`${userId}:`));
  for (const chave of chaves) {
    const fila = filas.get(chave);
    if (fila) {
      for (const item of fila.queue) {
        item.reject(new Error("Fila limpa"));
      }
      fila.queue = [];
      fila.processing = false;
      filas.delete(chave);
    }
  }
}

module.exports = { enfileirar, status, listar, limpar }
