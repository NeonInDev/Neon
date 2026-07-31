require("dotenv").config();

const required = { TOKEN: process.env.TOKEN, MASTER_KEY: process.env.MASTER_KEY };

for (const [key, val] of Object.entries(required)) {
  if (!val) {
    console.error(`[ERRO] ${key} não definida no .env`);
    process.exit(1);
  }
}

module.exports = {
  ...required,
  CLIENT_ID: process.env.CLIENT_ID,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3-0324:free",
  VOZ_NEON: process.env.VOZ_NEON || "pt-BR-FranciscaNeural",
  DOCS_PORT: parseInt(process.env.DOCS_PORT, 10) || 3000,
};
