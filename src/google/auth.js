const fs = require("fs");
const path = require("path");
const http = require("http");
const { log } = require("../logger");

const ROOT = path.join(__dirname, "..", "..");
const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || path.join(ROOT, "google_credentials.json");
const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || path.join(ROOT, "google_token.json");
const PORT = parseInt(process.env.GOOGLE_OAUTH_PORT, 10) || 8787;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}`;

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive",
];

let oauth2Client = null;

function credentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
    return parsed.installed || parsed.web || null;
  } catch {
    return null;
  }
}

function getClient() {
  if (oauth2Client) return oauth2Client;
  const cred = credentials();
  if (!cred) return null;
  const { google } = require("googleapis");
  oauth2Client = new google.auth.OAuth2(cred.client_id, cred.client_secret, REDIRECT_URI);
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8")));
    } catch (err) {
      log("WARN", "[GOOGLE] Token invalido", { erro: err.message });
    }
  }
  return oauth2Client;
}

function isAuthenticated() {
  const client = getClient();
  return !!client && !!client.credentials && !!client.credentials.refresh_token;
}

function getAuthUrl() {
  const client = getClient();
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

async function exchangeCode(code) {
  const client = getClient();
  if (!client) throw new Error("google_credentials.json nao encontrado");
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  log("INFO", "[GOOGLE] Token salvo em google_token.json");
  return tokens;
}

function logout() {
  oauth2Client = null;
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
    log("INFO", "[GOOGLE] Token removido");
    return true;
  }
  return false;
}

async function status() {
  return {
    autenticado: isAuthenticated(),
    credentialsExists: !!credentials(),
    tokenExists: fs.existsSync(TOKEN_PATH),
    port: PORT,
    redirectUri: REDIRECT_URI,
    escopos: SCOPES.map((s) => s.replace("https://www.googleapis.com/auth/", "")),
  };
}

function novaConexao(api, versao) {
  const { google } = require("googleapis");
  const client = getClient();
  if (!client) return null;
  return google[api]({ version: versao, auth: client });
}

module.exports = {
  CREDENTIALS_PATH,
  TOKEN_PATH,
  PORT,
  REDIRECT_URI,
  SCOPES,
  credentials,
  getClient,
  isAuthenticated,
  getAuthUrl,
  exchangeCode,
  logout,
  status,
  novaConexao,
};
