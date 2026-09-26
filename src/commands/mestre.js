const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const { db, initDB } = require("../db");
const { isOwner } = require("../perm");
const { log } = require("../logger");

// Comando de DIAGNOSTICO e controle do acesso mestre.
//
// LIGAR continua sendo so pela chave mestra na DM (o "segredinho"): nao existe
// caminho no slash command pra conceder acesso, senao qualquer um com o ID
// poderia se auto-elevar. Este comando so aponta o caminho.
//
// DESLIGAR e seguro sem segredo: revogar acesso nunca da poder a mais, e sem
// isso a unica forma de tirar o acesso era editar memory.json na mao.
module.exports = {
  data: new SlashCommandBuilder()
    .setName("mestre")
    .setDescription("Mostra o estado do seu acesso mestre na Neon")
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .addSubcommand((s) => s.setName("status").setDescription("Mostra o estado do acesso e por que um comando nega"))
    .addSubcommand((s) => s.setName("ligar").setDescription("Explica como ligar o acesso mestre (manda a chave na DM)"))
    .addSubcommand((s) => s.setName("desligar").setDescription("Desliga o seu acesso mestre agora")),
  publico: true,
  async execute(interaction) {
    await initDB().catch(() => {});
    const uid = interaction.user.id;
    const sub = interaction.options.getSubcommand(false) || "status";
    const dono = isOwner(uid);
    const registro = db.data.users?.[uid] || null;
    const ativo = !!registro?.mestre;

    if (sub === "desligar") return desligar(interaction, uid, dono, ativo);
    if (sub === "ligar") return ligar(interaction, uid, dono, ativo);

    const linhas = [
      `👤 Seu ID: \`${uid}\``,
      `👑 Dono do servidor: ${dono ? "sim" : "não"}`,
      `🔑 Acesso mestre: ${ativo ? "**ATIVO**" : "**desligado**"}`,
      `📦 Registro no banco: ${registro ? "existe" : "**não existe**"}`,
    ];

    if (!ativo) {
      linhas.push(
        "",
        "**Por que nega?** Comandos `adminOnly` exigem `mestre` ligado no seu registro. É o mesmo flag que o `/backup listar` consulta.",
        "",
        "**Como ligar:** mande a chave mestra **na DM** da Neon. Só funciona em DM, de propósito. Fica gravado em `memory.json`, então **não morre quando a Neon reinicia**.",
        "",
        "**Como desligar:** `/mestre desligar`. Você mesmo revoga, na hora, sem precisar da chave."
      );
    } else {
      linhas.push("", "Se um comando ainda disser *acesso negado*, ele tem uma trava própria além do acesso mestre (ex.: precisa estar num canal de staff).");
    }

    return interaction.reply({ content: linhas.join("\n"), ephemeral: true });
  },
};

// revogar o proprio acesso: so o dono, so se ja tem, e nao exige a chave
// (revogar nunca concede poder a mais)
async function desligar(interaction, uid, dono, ativo) {
  if (!dono) {
    return interaction.reply({ content: "🔒 Só o dono do servidor pode mexer no acesso mestre.", ephemeral: true });
  }
  if (!ativo) {
    return interaction.reply({ content: "➖ Seu acesso mestre já está desligado.", ephemeral: true });
  }
  db.data.users[uid].mestre = false;
  await db.write();
  log("INFO", "Acesso mestre desligado pelo dono", { id: uid });
  return interaction.reply({
    content:
      "➖ **Acesso mestre desligado.**\n" +
      "Os 15 comandos `adminOnly` voltaram a negar pra você até mandar a chave de novo na DM.",
    ephemeral: true,
  });
}

// explicar o caminho da chave. nao concede nada: so a chave na DM concede.
async function ligar(interaction, uid, dono, ativo) {
  if (!dono) {
    return interaction.reply({ content: "🔒 Só o dono do servidor pode mexer no acesso mestre.", ephemeral: true });
  }
  if (ativo) {
    return interaction.reply({ content: "🔑 Seu acesso mestre já está **ATIVO**.", ephemeral: true });
  }
  return interaction.reply({
    content:
      "🔑 **Para ligar, mande a chave mestra na DM da Neon.**\n" +
      "Não existe comando que ligue isso, de propósito: se existisse, qualquer pessoa com o seu ID poderia se auto-elevar sem a chave.\n\n" +
      "Funciona só em DM e grava em `memory.json`, então não morre quando a Neon reinicia.",
    ephemeral: true,
  });
}
