const { log } = require("./logger")

let autenticado = false
let service = null

async function autenticar() {
  if (autenticado && service) return service
  const { google } = require("googleapis")
  const path = require("path")
  const fs = require("fs")
  const CREDENTIALS_PATH = path.join(__dirname, "..", "google_credentials.json")
  const TOKEN_PATH = path.join(__dirname, "..", "google_token.json")
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    log("WARN", "[CALENDARIO] google_credentials.json nao encontrado")
    return null
  }
  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"))
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web
    const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0] || "urn:ietf:wg:oauth:2.0:oob")
    if (fs.existsSync(TOKEN_PATH)) {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"))
      oauth2Client.setCredentials(token)
    } else {
      log("WARN", "[CALENDARIO] Token nao encontrado. Siga as instrucoes para autenticar.")
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/calendar.readonly"]
      })
      log("INFO", "[CALENDARIO] URL de autenticacao:", authUrl)
      return null
    }
    service = google.calendar({ version: "v3", auth: oauth2Client })
    autenticado = true
    log("INFO", "[CALENDARIO] Autenticado!")
    return service
  } catch (err) {
    log("WARN", "[CALENDARIO] Erro autenticacao", { erro: err.message })
    return null
  }
}

async function listarEventos(quantidade = 5) {
  const calendar = await autenticar()
  if (!calendar) return { ok: false, erro: "Calendar nao autenticado. Configure google_credentials.json" }
  try {
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults: quantidade,
      singleEvents: true,
      orderBy: "startTime"
    })
    const eventos = res.data.items.map(e => ({
      titulo: e.summary,
      inicio: e.start?.dateTime || e.start?.date || "N/A",
      fim: e.end?.dateTime || e.end?.date || "N/A",
      descricao: e.description?.slice(0, 200) || "",
      local: e.location || ""
    }))
    return { ok: true, eventos }
  } catch (err) {
    log("WARN", "[CALENDARIO] Erro ao listar", { erro: err.message })
    return { ok: false, erro: err.message }
  }
}

async function eventosHoje() {
  const calendar = await autenticar()
  if (!calendar) return { ok: false, erro: "Calendar nao autenticado" }
  try {
    const agora = new Date()
    const fimDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59)
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: agora.toISOString(),
      timeMax: fimDoDia.toISOString(),
      singleEvents: true,
      orderBy: "startTime"
    })
    const eventos = res.data.items.map(e => ({
      titulo: e.summary,
      inicio: e.start?.dateTime || e.start?.date || "N/A",
      local: e.location || ""
    }))
    return { ok: true, eventos, total: eventos.length }
  } catch (err) {
    return { ok: false, erro: err.message }
  }
}

async function criarEvento(titulo, dataHoraInicio, dataHoraFim, descricao = "") {
  const calendar = await autenticar()
  if (!calendar) return { ok: false, erro: "Calendar nao autenticado" }
  try {
    const evento = await calendar.events.insert({
      calendarId: "primary",
      resource: {
        summary: titulo,
        description: descricao,
        start: { dateTime: new Date(dataHoraInicio).toISOString(), timeZone: "America/Sao_Paulo" },
        end: { dateTime: new Date(dataHoraFim).toISOString(), timeZone: "America/Sao_Paulo" }
      }
    })
    return { ok: true, id: evento.data.id, link: evento.data.htmlLink }
  } catch (err) {
    return { ok: false, erro: err.message }
  }
}

async function status() {
  return { autenticado, credentialsExists: require("fs").existsSync(require("path").join(__dirname, "..", "google_credentials.json")) }
}

module.exports = { autenticar, listarEventos, eventosHoje, criarEvento, status }
