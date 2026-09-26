const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const { db, initDB } = require("../db");
const { isOwner } = require("../perm");
const { log } = require("../logger");

// Comando de DIAGNOSTICO do acesso mestre. Nao existe subcomando pra ligar:
// o acesso so e concedido mandando a chave mestra na DM (o "segredinho").
// Este comando existe pra mostrar POR QUE um comando esta negando acesso,
// em vez de o usuario ficar adivinhando.
module.exports = {
  data: new SlashCommandBuilder()
    .setName("mestre")
    .setDescription("Mostra o estado do seu acesso mestre na Neon")
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall),
  publico: true,
  async execute(interaction) {
    await initDB().catch(() => {});
    const uid = interaction.user.id;
    const dono = isOwner(uid);
    const registro = db.data.users?.[uid] || null;
    const ativo = !!registro?.mestre;

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
        "**Como desligar:** o `/revogar` recusa revogar o seu próprio acesso (trava de segurança). Para desligar, ponha `\"mestre\": false` no seu registro em `memory.json` e reinicie a Neon."
      );
    } else {
      linhas.push("", "Se um comando ainda disser *acesso negado*, ele tem uma trava própria além do acesso mestre (ex.: precisa estar num canal de staff).");
    }

    return interaction.reply({ content: linhas.join("\n"), ephemeral: true });
  },
};
