const bridge = require("../src/bridge");
const axios = require("axios");

let processed = new Set();

async function pesquisarWeb(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const { data } = await axios.get(url, { timeout: 10000 });
    if (data.AbstractText) return data.AbstractText;
    if (data.RelatedTopics?.length) return data.RelatedTopics[0].Text || data.RelatedTopics[0].FirstURL;
    return `Nenhum resultado encontrado para: ${query}. Use "pesquisar | ${query}" manualmente no opencode.`;
  } catch (err) {
    return `Erro na pesquisa: ${err.message}. Tente manualmente.`;
  }
}

async function processarTask(task) {
  if (processed.has(task.id)) return;
  processed.add(task.id);

  const prompt = task.prompt;

  if (/^pesquisar:\s*(.+)/i.test(prompt)) {
    const query = RegExp.$1;
    console.log(`\n[PESQUISA] ${query}`);
    const resultado = await pesquisarWeb(query);
    bridge.concluirTask(task.id, resultado);
    console.log(`[RESULTADO] Task ${task.id} resolvida`);
    return;
  }

  console.log(`\n=== NOVA TASK (ID: ${task.id}) ===`);
  console.log(`  Prompt: ${prompt}`);
  console.log(`  UserId: ${task.userId}`);
  console.log("================================\n");
}

async function iniciar() {
  console.log("[AUTO] Bridge watcher rodando... (Ctrl+C para parar)");
  setInterval(async () => {
    try {
      const task = bridge.getProximaTask();
      if (task) await processarTask(task);
    } catch (err) {
      console.error("[AUTO] Erro:", err.message);
    }
  }, 3000);
}

if (require.main === module) iniciar();
module.exports = { iniciar };
