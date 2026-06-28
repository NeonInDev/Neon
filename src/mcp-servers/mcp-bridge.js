const { log } = require("../logger");
const bridge = require("../bridge");
const opencode = require("../opencode");

const tools = [
  {
    nome: "codar",
    desc: "Delega tarefa ao agente de codigo (opencode). Usar para alterar codigo fonte, criar arquivos, criar projetos, instalar dependencias npm, corrigir bugs, refatorar, documentar.",
    formato: "codar | [descricao da tarefa]",
  },
];

async function handleCall(nome, args, userId) {
  switch (nome) {
    case "codar": {
      if (!args) return "Descreva o que codar.";
      try {
        const taskId = bridge.pedirOpencode(args, userId);
        const task = await bridge.aguardarTask(taskId, 300000);
        if (task.status === "done") return task.result || "✅ Tarefa concluída pelo opencode.";
        if (task.status === "timeout") {
          const resultado = await opencode.executar(args);
          if (resultado) return resultado;
          return "⏱️ opencode não respondeu. Tente novamente.";
        }
        return "❌ Falha ao executar no opencode.";
      } catch (err) {
        log("ERROR", "[MCP-BRIDGE] codar error", { erro: err.message });
        return `❌ Erro no codar: ${err.message}`;
      }
    }

    default:
      throw new Error(`Tool desconhecida: ${nome}`);
  }
}

module.exports = { nome: "Bridge", tools, handleCall };
