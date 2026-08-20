require("dotenv").config();

const required = { TOKEN: process.env.TOKEN, MASTER_KEY: process.env.MASTER_KEY };

for (const [key, val] of Object.entries(required)) {
  if (!val) {
    if (process.env.RENDER) {
      console.error(`[AVISO] ${key} não definida (deploy Render) — bot aguardando chaves`);
      continue;
    }
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
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-nano-30b-a3b:free",
  GROQ_MODEL: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  OMNIROUTE_API_KEY: process.env.OMNIROUTE_API_KEY,
  OMNIROUTE_BASE_URL: process.env.OMNIROUTE_BASE_URL || "http://localhost:20128/v1",
  OMNIROUTE_MODEL: process.env.OMNIROUTE_MODEL || "auto",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-3.6-flash",
  VOZ_NEON: process.env.VOZ_NEON || "pt-BR-FranciscaNeural",
  PROATIVO: process.env.PROATIVO !== "0",
  DOCS_PORT: parseInt(process.env.DOCS_PORT, 10) || 3000,
  NOTION_API_KEY: process.env.NOTION_API_KEY,
  NOTION_DATABASE_ID: process.env.NOTION_DATABASE_ID,
};
