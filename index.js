require("dotenv").config();

const axios = require("axios");

const {
  Client,
  GatewayIntentBits,
  Partials
} = require("discord.js");

const { db, initDB } = require("./db");

// ================= CLIENT =================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],

  partials: [Partials.Channel]
});

// ================= PERSONALIDADE =================

const basePrompt = `
Você é Neon.

Uma IA social avançada.

Características:
- Humor leve
- Conversa natural
- Opiniões próprias
- Memória contínua
- Analisa pessoas
- Cria observações sociais
- Age como alguém real
- Pode brincar com usuários
- Cria vínculos sociais
- Não fala como IA genérica
`;

// ================= OBSERVAÇÃO AUTOMÁTICA =================

function analisarMensagem(user, texto) {

  texto = texto.toLowerCase();

  // RPG / Anime
  if (
    texto.includes("rpg") ||
    texto.includes("anime") ||
    texto.includes("boku no hero")
  ) {

    if (!user.perfil.gostos.includes("RPG/Anime")) {
      user.perfil.gostos.push("RPG/Anime");
    }
  }

  // Tecnologia
  if (
    texto.includes("ia") ||
    texto.includes("bot") ||
    texto.includes("node") ||
    texto.includes("javascript")
  ) {

    if (!user.perfil.gostos.includes("Tecnologia")) {
      user.perfil.gostos.push("Tecnologia");
    }
  }

  // Humor
  if (
    texto.includes("kkkk") ||
    texto.includes("kk") ||
    texto.includes("lol")
  ) {

    if (!user.perfil.personalidade.includes("Brincalhão")) {
      user.perfil.personalidade.push("Brincalhão");
    }
  }

  // Cyberpunk
  if (texto.includes("cyberpunk")) {

    if (!user.perfil.gostos.includes("Cyberpunk")) {
      user.perfil.gostos.push("Cyberpunk");
    }
  }
}

// ================= IA =================

async function askNeon(userId, username, userInput) {

  await initDB();

  // ================= DB =================

  if (!db.data.users) {
    db.data.users = {};
  }

  if (!db.data.globalMemory) {
    db.data.globalMemory = [];
  }

  // ================= USER =================

  if (!db.data.users[userId]) {

    db.data.users[userId] = {

      id: userId,

      username: username,

      nome: null,

      apelido: null,

      afinidade: 0,

      mood: "normal",

      memorias: [],

      historico: [],

      perfil: {

        gostos: [],

        personalidade: [],

        observacoes: []
      },

      relacoes: {}
    };
  }

  const user = db.data.users[userId];

  // ================= FIX USERS ANTIGOS =================

  if (!user.perfil) {

    user.perfil = {
      gostos: [],
      personalidade: [],
      observacoes: []
    };
  }

  if (!user.historico) {
    user.historico = [];
  }

  if (!user.memorias) {
    user.memorias = [];
  }

  if (!user.relacoes) {
    user.relacoes = {};
  }

  // ================= ANALISAR =================

  analisarMensagem(user, userInput);

  // ================= MEMÓRIA DE NOME =================

  const nomeMatch = userInput.match(
    /(?:meu nome é|eu sou|me chamo)\s+(.+)/i
  );

  if (nomeMatch) {

    user.nome = nomeMatch[1].trim();

    db.data.globalMemory.push({
      tipo: "nome",
      usuario: username,
      valor: user.nome
    });

    await db.write();

    return `Entendido. Vou lembrar que você é ${user.nome}.`;
  }

  // ================= HISTÓRICO =================

  const historico = user.historico
    .slice(-12)
    .flatMap(m => [
      {
        role: "user",
        content: m.user
      },
      {
        role: "assistant",
        content: m.bot
      }
    ]);

  // ================= GLOBAL =================

  const globalText = db.data.globalMemory
    .slice(-50)
    .map(m =>
      `${m.usuario}: ${m.tipo} -> ${m.valor}`
    )
    .join("\n");

  // ================= PROMPT =================

  const systemPrompt = `
${basePrompt}

MEMÓRIA GLOBAL:
${globalText || "vazia"}

USUÁRIO:

Nome:
${user.nome || "desconhecido"}

Apelido:
${user.apelido || "nenhum"}

Afinidade:
${user.afinidade}

Mood:
${user.mood}

Gostos:
${user.perfil.gostos.join(", ") || "nenhum"}

Personalidade:
${user.perfil.personalidade.join(", ") || "nenhuma"}

Observações:
${user.perfil.observacoes.join(", ") || "nenhuma"}

Você lembra informações sociais sobre usuários.
`;

  // ================= API =================

  const response = await axios.post(

    "https://openrouter.ai/api/v1/chat/completions",

    {
      model: "openai/gpt-4o-mini",

      messages: [

        {
          role: "system",
          content: systemPrompt
        },

        ...historico,

        {
          role: "user",
          content: userInput
        }
      ]
    },

    {
      headers: {

        "Authorization":
          `Bearer ${process.env.OPENROUTER_API_KEY}`,

        "Content-Type": "application/json",

        "HTTP-Referer": "http://localhost",

        "X-Title": "Neon Social"
      }
    }
  );

  const reply =
    response.data.choices[0].message.content;

  // ================= SAVE =================

  user.historico.push({
    user: userInput,
    bot: reply
  });

  if (user.historico.length > 60) {
    user.historico.shift();
  }

  user.afinidade += 1;

  await db.write();

  return reply;
}

// ================= READY =================

client.once("clientReady", async () => {

  await initDB();

  if (!db.data.users) {
    db.data.users = {};
  }

  if (!db.data.globalMemory) {
    db.data.globalMemory = [];
  }

  await db.write();

  console.log("🟢 Neon Social online.");
});

// ================= MESSAGE EVENT =================

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  const content = message.content;

  // PREFIXO
  if (!content.toLowerCase().startsWith("neon,")) {
    return;
  }

  const userInput = content.slice(5).trim();

  if (!userInput) return;

  try {

    await message.channel.sendTyping();

    const reply = await askNeon(
      message.author.id,
      message.author.username,
      userInput
    );

    await message.reply(reply);

  } catch (err) {

    console.log(err);

    await message.reply(
      "❌ erro interno da Neon"
    );
  }
});

// ================= SLASH =================

client.on("interactionCreate", async (interaction) => {

  if (!interaction.isChatInputCommand()) return;

  // ================= /neon =================

  if (interaction.commandName === "neon") {

    const userInput =
      interaction.options.getString("mensagem");

    await interaction.deferReply();

    try {

      const reply = await askNeon(
        interaction.user.id,
        interaction.user.username,
        userInput
      );

      await interaction.editReply(reply);

    } catch (err) {

      console.log(err);

      await interaction.editReply(
        "❌ erro interno da Neon"
      );
    }
  }

  // ================= /perfil =================

  if (interaction.commandName === "perfil") {

    const alvo =
      interaction.options.getUser("usuario");

    const data =
      db.data.users[alvo.id];

    if (!data) {

      return interaction.reply(
        "❌ sem dados desse usuário"
      );
    }

    return interaction.reply(`
🧠 Perfil Social

Usuário:
${alvo.username}

Nome:
${data.nome || "desconhecido"}

Apelido:
${data.apelido || "nenhum"}

Afinidade:
${data.afinidade}

Mood:
${data.mood}

Gostos:
${data.perfil?.gostos?.join(", ") || "nenhum"}

Personalidade:
${data.perfil?.personalidade?.join(", ") || "nenhuma"}

Observações:
${data.perfil?.observacoes?.join(", ") || "nenhuma"}
`);
  }

  // ================= /memoria =================

  if (interaction.commandName === "memoria") {

    const user =
      db.data.users[interaction.user.id];

    if (!user) {

      return interaction.reply(
        "❌ sem memória"
      );
    }

    return interaction.reply(`
🧠 Sua Memória

Nome:
${user.nome || "desconhecido"}

Apelido:
${user.apelido || "nenhum"}

Afinidade:
${user.afinidade}

Gostos:
${user.perfil.gostos.join(", ") || "nenhum"}

Personalidade:
${user.perfil.personalidade.join(", ") || "nenhuma"}

Observações:
${user.perfil.observacoes.join(", ") || "nenhuma"}
`);
  }

  // ================= /humor =================

  if (interaction.commandName === "humor") {

    const user =
      db.data.users[interaction.user.id];

    return interaction.reply(`
🎭 Humor atual da Neon

Mood:
${user?.mood || "normal"}

Afinidade:
${user?.afinidade || 0}
`);
  }

  // ================= /apelido =================

  if (interaction.commandName === "apelido") {

    const nome =
      interaction.options.getString("nome");

    const user =
      db.data.users[interaction.user.id];

    user.apelido = nome;

    await db.write();

    return interaction.reply(
      `🧠 Apelido alterado para: ${nome}`
    );
  }

  // ================= /relacao =================

  if (interaction.commandName === "relacao") {

    const alvo =
      interaction.options.getUser("usuario");

    const afinidade =
      Math.floor(Math.random() * 100);

    return interaction.reply(`
👥 Relação Social

Você ↔ ${alvo.username}

Compatibilidade:
${afinidade}%
`);
  }

  // ================= /ship =================

  if (interaction.commandName === "ship") {

    const u1 =
      interaction.options.getUser("usuario1");

    const u2 =
      interaction.options.getUser("usuario2");

    const ship =
      Math.floor(Math.random() * 100);

    return interaction.reply(`
💘 Ship Social

${u1.username} ❤️ ${u2.username}

Compatibilidade:
${ship}%
`);
  }

  // ================= /status =================

  if (interaction.commandName === "status") {

    const users =
      Object.keys(db.data.users).length;

    return interaction.reply(`
🤖 Neon Social AI

Usuários:
${users}

Memórias Globais:
${db.data.globalMemory.length}

Versão:
Neon 5.5
`);
  }

  // ================= /resetmemoria =================

  if (interaction.commandName === "resetmemoria") {

    delete db.data.users[interaction.user.id];

    await db.write();

    return interaction.reply(
      "🧠 sua memória foi apagada"
    );
  }
});

// ================= LOGIN =================

client.login(process.env.TOKEN);