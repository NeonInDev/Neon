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
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  DOCS_PORT: parseInt(process.env.DOCS_PORT, 10) || 3000,
};
