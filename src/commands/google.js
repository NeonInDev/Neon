const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const google = require("../google");
const { log } = require("../logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("google")
    .setDescription("Integração com Google (Calendar, Tasks, Gmail, Drive)")
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel
    )
    .setIntegrationTypes(
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall
    )
    .addSubcommand((s) =>
      s.setName("status").setDescription("Verifica se o Google esta autenticado")
    )
    .addSubcommand((s) =>
      s
        .setName("agenda")
        .setDescription("Eventos do Google Calendar")
        .addStringOption((o) =>
          o
            .setName("quando")
            .setDescription("Quais eventos?")
            .setRequired(true)
            .addChoices(
              { name: "Hoje", value: "hoje" },
              { name: "Proximos", value: "proximos" },
              { name: "Proxima semana", value: "semana" }
            )
        )
    )
    .addSubcommand((s) =>
      s
        .setName("tarefas")
        .setDescription("Google Tasks")
        .addStringOption((o) =>
          o
            .setName("acao")
            .setDescription("O que fazer?")
            .setRequired(true)
            .addChoices(
              { name: "Listar pendentes", value: "listar" },
              { name: "Adicionar", value: "criar" },
              { name: "Concluir", value: "concluir" }
            )
        )
        .addStringOption((o) => o.setName("tarefa").setDescription("Texto da tarefa"))
    )
    .addSubcommand((s) =>
      s
        .setName("gmail")
        .setDescription("Caixa de entrada do Gmail")
        .addStringOption((o) =>
          o
            .setName("filtro")
            .setDescription("O que mostrar?")
            .setRequired(true)
            .addChoices(
              { name: "Recentes", value: "recentes" },
              { name: "Nao lidos", value: "nao_lidos" }
            )
        )
    )
    .addSubcommand((s) =>
      s
        .setName("drive")
        .setDescription("Google Drive")
        .addStringOption((o) => o.setName("busca").setDescription("Nome do arquivo (opcional)"))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply();

    const st = await google.status();
    if (!st.credentialsExists || !st.autenticado) {
      await interaction.editReply("❌ Google nao configurado. Rode `node google_oauth_setup.js` na maquina da Neon (veja README).");
      return;
    }

    try {
      let resposta = "";
      if (sub === "status") {
        const s = await google.status();
        resposta = s.autenticado ? "✅ Google autenticado e funcionando." : "⚠️ Credenciais ok, mas sem token. Rode `node google_oauth_setup.js`.";
      } else if (sub === "agenda") {
        const quando = interaction.options.getString("quando");
        let r;
        if (quando === "hoje") r = await google.calendar.eventosHoje();
        else if (quando === "semana") r = await google.calendar.listarSemana();
        else r = await google.calendar.listarEventos(8);
        if (!r.ok) return await interaction.editReply(`❌ ${r.erro}`);
        if (!r.eventos.length) return await interaction.editReply("Nenhum evento encontrado. 📅");
        resposta = "📅 **Eventos:**\n" + r.eventos.map((e) => `- **${e.titulo}** (${new Date(e.inicio).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})`).join("\n");
      } else if (sub === "tarefas") {
        const acao = interaction.options.getString("acao");
        const tarefa = interaction.options.getString("tarefa") || "";
        if (acao === "criar") {
          if (!tarefa.trim()) return await interaction.editReply("❌ Informe a tarefa (opção **tarefa**).");
          const r = await google.tasks.criar(tarefa.trim());
          return await interaction.editReply(r.ok ? `✅ Tarefa adicionada: **${r.titulo}**` : `❌ ${r.erro}`);
        }
        if (acao === "concluir") {
          if (!tarefa.trim()) return await interaction.editReply("❌ Informe o nome da tarefa a concluir.");
          const r = await google.tasks.concluir(tarefa.trim());
          return await interaction.editReply(r.ok && r.concluida ? `✅ Concluida: **${r.titulo}** 🎉` : `❌ ${r.erro || `Nao achei "${tarefa}".`}`);
        }
        const r = await google.tasks.listar();
        if (!r.ok) return await interaction.editReply(`❌ ${r.erro}`);
        resposta = r.tarefas.length ? "📋 **Tarefas pendentes:**\n" + r.tarefas.map((t, i) => `${i + 1}. **${t.titulo}**`).join("\n") : "Nenhuma tarefa pendente. 🎉";
      } else if (sub === "gmail") {
        const filtro = interaction.options.getString("filtro");
        if (filtro === "nao_lidos") {
          const r = await google.gmail.naoLidos();
          if (!r.ok) return await interaction.editReply(`❌ ${r.erro}`);
          return await interaction.editReply(`📬 Voce tem **${r.total ?? 0} emails nao lidos**.`);
        }
        const r = await google.gmail.listar(5);
        if (!r.ok) return await interaction.editReply(`❌ ${r.erro}`);
        resposta = r.emails.length ? "📥 **Emails recentes:**\n" + r.emails.map((e) => `- **${e.assunto}** (de ${e.de})`).join("\n") : "Caixa de entrada vazia. 📭";
      } else if (sub === "drive") {
        const busca = interaction.options.getString("busca") || "";
        const r = busca.trim() ? await google.drive.buscar(busca.trim()) : await google.drive.listar(8);
        if (!r.ok) return await interaction.editReply(`❌ ${r.erro}`);
        if (!r.arquivos.length) return await interaction.editReply(busca.trim() ? `Nenhum arquivo "${busca}".` : "Drive vazio. 📂");
        resposta = "📂 **Arquivos:**\n" + r.arquivos.map((f) => `- **${f.nome}**${f.link ? ` — ${f.link}` : ""}`).join("\n");
      }

      await interaction.editReply(resposta);
      log("INFO", "Comando /google executado", { usuario: interaction.user.username, sub });
    } catch (err) {
      log("ERROR", "Erro no /google", { erro: err.message });
      await interaction.editReply(`❌ Erro: ${err.message}`);
    }
  },
};
