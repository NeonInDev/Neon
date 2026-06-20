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
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct",
  AI_PROVIDER: (process.env.AI_PROVIDER || "openrouter").toLowerCase(),
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  OPENCODE_MODEL: process.env.OPENCODE_MODEL || "deepseek/deepseek-chat",
  DOCS_PORT: parseInt(process.env.DOCS_PORT, 10) || 3000,
};
