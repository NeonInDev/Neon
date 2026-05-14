require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

// ==================================================
// COMMANDS
// ==================================================

const commands = [

  // ==================================================
  // /neon
  // ==================================================

  new SlashCommandBuilder()

    .setName("neon")

    .setDescription(
      "Falar com a Neon"
    )

    .addStringOption(option =>

      option

        .setName("mensagem")

        .setDescription(
          "Mensagem"
        )

        .setRequired(true)
    ),

  // ==================================================
  // /blacklist
  // ==================================================

  new SlashCommandBuilder()

    .setName("blacklist")

    .setDescription(
      "Adicionar usuário à blacklist"
    )

    .addUserOption(option =>

      option

        .setName("usuario")

        .setDescription(
          "Usuário"
        )

        .setRequired(true)
    ),

  // ==================================================
  // /unblacklist
  // ==================================================

  new SlashCommandBuilder()

    .setName("unblacklist")

    .setDescription(
      "Remover usuário da blacklist"
    )

    .addUserOption(option =>

      option

        .setName("usuario")

        .setDescription(
          "Usuário"
        )

        .setRequired(true)
    ),

  // ==================================================
  // /afinidade
  // ==================================================

  new SlashCommandBuilder()

    .setName("afinidade")

    .setDescription(
      "Alterar afinidade"
    )

    .addUserOption(option =>

      option

        .setName("usuario")

        .setDescription(
          "Usuário"
        )

        .setRequired(true)
    )

    .addIntegerOption(option =>

      option

        .setName("valor")

        .setDescription(
          "Novo valor"
        )

        .setRequired(true)
    ),

  // ==================================================
  // /mood
  // ==================================================

  new SlashCommandBuilder()

    .setName("mood")

    .setDescription(
      "Alterar mood global"
    )

    .addStringOption(option =>

      option

        .setName("tipo")

        .setDescription(
          "Novo mood"
        )

        .setRequired(true)
    ),

  // ==================================================
  // /apelido
  // ==================================================

  new SlashCommandBuilder()

    .setName("apelido")

    .setDescription(
      "Alterar apelido"
    )

    .addUserOption(option =>

      option

        .setName("usuario")

        .setDescription(
          "Usuário"
        )

        .setRequired(true)
    )

    .addStringOption(option =>

      option

        .setName("apelido")

        .setDescription(
          "Novo apelido"
        )

        .setRequired(true)
    ),

  // ==================================================
  // /memoria
  // ==================================================

  new SlashCommandBuilder()

    .setName("memoria")

    .setDescription(
      "Adicionar memória"
    )

    .addUserOption(option =>

      option

        .setName("usuario")

        .setDescription(
          "Usuário"
        )

        .setRequired(true)
    )

    .addStringOption(option =>

      option

        .setName("texto")

        .setDescription(
          "Texto da memória"
        )

        .setRequired(true)
    ),

  // ==================================================
  // /limparmemoria
  // ==================================================

  new SlashCommandBuilder()

    .setName("limparmemoria")

    .setDescription(
      "Limpar memória"
    )

    .addUserOption(option =>

      option

        .setName("usuario")

        .setDescription(
          "Usuário"
        )

        .setRequired(true)
    ),

  // ==================================================
  // /perfil
  // ==================================================

  new SlashCommandBuilder()

    .setName("perfil")

    .setDescription(
      "Ver perfil"
    )

    .addUserOption(option =>

      option

        .setName("usuario")

        .setDescription(
          "Usuário"
        )

        .setRequired(true)
    )

].map(command =>
  command.toJSON()
);

// ==================================================
// REST
// ==================================================

const rest = new REST({
  version: "10"
}).setToken(
  process.env.TOKEN
);

// ==================================================
// DEPLOY
// ==================================================

(async () => {

  try {

    console.log(
      "🔄 atualizando slash commands..."
    );

    await rest.put(

      Routes.applicationCommands(
        process.env.CLIENT_ID
      ),

      {
        body: commands
      }
    );

    console.log(
      "✅ slash commands atualizados."
    );

  } catch (err) {

    console.log(
      "❌ erro no deploy:"
    );

    console.log(err);
  }
})();