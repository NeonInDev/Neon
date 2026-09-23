const { log } = require("./logger")

const filas = new Map()

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
  try {
    const resultado = await taskFn()
    resolve(resultado)
  } catch (err) {
    reject(err)
  }
  processarProxima(userId)
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
