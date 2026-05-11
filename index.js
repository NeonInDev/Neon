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

Uma IA inteligente, humana e natural.

Características:
- Tem humor leve
- Conversa naturalmente
- Lembra pessoas
- Analisa comportamento
- Tem opinião própria
- Age como uma pessoa real
- Não fala como IA genérica
- Usa respostas fluidas e modernas
`;

// ================= IA =================

async function askNeon(userId, username, userInput) {

  await initDB();

  // ================= BANCO GLOBAL =================

  if (!db.data.globalMemory) {
    db.data.globalMemory = [];
  }

  if (!db.data.users) {
    db.data.users = {};
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
      }
    };
  }

  const user = db.data.users[userId];

  // ================= CORRIGIR USERS ANTIGOS =================

  if (!user.perfil) {

    user.perfil = {
      gostos: [],
      personalidade: [],
      observacoes: []
    };
  }

  if (!user.memorias) {
    user.memorias = [];
  }

  if (!user.historico) {
    user.historico = [];
  }

  if (!user.mood) {
    user.mood = "normal";
  }

  if (!user.afinidade) {
    user.afinidade = 0;
  }

  // ================= MEMÓRIA DE NOME =================

  const nomeMatch = userInput.match(
    /(?:meu nome é|eu sou|me chamo)\s+(.+)/i
  );

  if (nomeMatch) {

    user.nome = nomeMatch[1].trim();

    db.data.globalMemory.push({
      type: "nome",
      user: username,
      value: user.nome
    });

    await db.write();

    return `Entendido. Vou lembrar que você é ${user.nome}.`;
  }

  // ================= GOSTOS =================

  const gostaMatch = userInput.match(
    /(?:eu gosto de|eu amo)\s+(.+)/i
  );

  if (gostaMatch) {

    const gosto = gostaMatch[1].trim();

    if (!user.perfil.gostos.includes(gosto)) {

      user.perfil.gostos.push(gosto);

      db.data.globalMemory.push({
        type: "gosto",
        user: username,
        value: gosto
      });

      await db.write();
    }
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

  // ================= MEMÓRIA GLOBAL =================

  const globalText = db.data.globalMemory
    .slice(-40)
    .map(m =>
      `${m.user}: ${m.type} -> ${m.value}`
    )
    .join("\n");

  // ================= PROMPT =================

  const systemPrompt = `
${basePrompt}

MEMÓRIA GLOBAL:

${globalText || "vazia"}

USUÁRIO ATUAL:

Nome:
${user.nome || "desconhecido"}

Apelido:
${user.apelido || "nenhum"}

Afinidade:
${user.afinidade}

Mood:
${user.mood}

Gostos:
${user.perfil.gostos.join("\n") || "nenhum"}

Memórias:
${user.memorias.join("\n") || "nenhuma"}

Você consegue lembrar informações sobre outros usuários caso elas estejam na memória global.
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

        "X-Title": "Neon Global"
      }
    }
  );

  // ================= RESPOSTA =================

  const reply =
    response.data.choices[0].message.content;

  // ================= SALVAR HISTÓRICO =================

  user.historico.push({
    user: userInput,
    bot: reply
  });

  if (user.historico.length > 50) {
    user.historico.shift();
  }

  // ================= AFINIDADE =================

  user.afinidade += 1;

  // ================= SALVAR =================

  await db.write();

  return reply;
}

// ================= READY =================

client.once("clientReady", async () => {

  await initDB();

  if (!db.data.globalMemory) {
    db.data.globalMemory = [];
  }

  if (!db.data.users) {
    db.data.users = {};
  }

  await db.write();

  console.log("🟢 Neon Global online.");
});

// ================= PREFIXO =================

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  const content = message.content;

  if (
    !content.toLowerCase().startsWith("neon,")
  ) return;

  const userInput =
    content.slice(5).trim();

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
      "❌ Erro interno da Neon."
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

    try {

      await interaction.deferReply();

      const reply = await askNeon(
        interaction.user.id,
        interaction.user.username,
        userInput
      );

      await interaction.editReply(reply);

    } catch (err) {

      console.log(err);

      await interaction.editReply(
        "❌ Erro interno da Neon."
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
        "❌ Não encontrei dados desse usuário."
      );
    }

    return interaction.reply(`
🧠 Perfil Social

Usuário:
${alvo.username}

Nome:
${data.nome || "desconhecido"}

Afinidade:
${data.afinidade || 0}

Mood:
${data.mood || "normal"}

Gostos:
${data.perfil?.gostos?.join("\n") || "nenhum"}

Memórias:
${data.memorias?.join("\n") || "nenhuma"}
`);
  }

  // ================= /memoria =================

  if (interaction.commandName === "memoria") {

    const user =
      db.data.users[interaction.user.id];

    if (!user) {

      return interaction.reply(
        "❌ Não encontrei sua memória."
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

Mood:
${user.mood}

Gostos:
${user.perfil?.gostos?.join("\n") || "nenhum"}
`);
  }

  // ================= /status =================

  if (interaction.commandName === "status") {

    const users =
      Object.keys(db.data.users).length;

    const memories =
      db.data.globalMemory.length;

    return interaction.reply(`
🤖 Neon Status

Sistema:
Online

Usuários:
${users}

Memórias globais:
${memories}

Modelo:
GPT-4o-mini

Versão:
Neon 4.1
`);
  }

  // ================= /resetmemoria =================

  if (interaction.commandName === "resetmemoria") {

    delete db.data.users[interaction.user.id];

    await db.write();

    return interaction.reply(
      "🧠 Sua memória foi apagada."
    );
  }
});

// ================= LOGIN =================

client.login(process.env.TOKEN);