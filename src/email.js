const { log } = require("./logger")

let transportador = null
let imapClient = null

const EMAIL_CONFIG = {
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT) || 587,
    user: process.env.EMAIL_USER || "",
    pass: process.env.EMAIL_PASS || ""
  },
  imap: {
    host: process.env.IMAP_HOST || "",
    port: parseInt(process.env.IMAP_PORT) || 993,
    user: process.env.EMAIL_USER || "",
    pass: process.env.EMAIL_PASS || ""
  }
}

function configurar(smtpHost, smtpPort, imapHost, imapPort, user, pass) {
  EMAIL_CONFIG.smtp.host = smtpHost || EMAIL_CONFIG.smtp.host
  EMAIL_CONFIG.smtp.port = smtpPort || EMAIL_CONFIG.smtp.port
  EMAIL_CONFIG.imap.host = imapHost || EMAIL_CONFIG.imap.host
  EMAIL_CONFIG.imap.port = imapPort || EMAIL_CONFIG.imap.port
  EMAIL_CONFIG.smtp.user = user || EMAIL_CONFIG.smtp.user
  EMAIL_CONFIG.imap.user = user || EMAIL_CONFIG.imap.user
  EMAIL_CONFIG.smtp.pass = pass || EMAIL_CONFIG.smtp.pass
  EMAIL_CONFIG.imap.pass = pass || EMAIL_CONFIG.imap.pass
  log("INFO", "[EMAIL] Configuracao atualizada")
}

async function enviar(para, assunto, corpo) {
  if (!EMAIL_CONFIG.smtp.user || !EMAIL_CONFIG.smtp.pass) {
    return { ok: false, erro: "Email nao configurado. Defina EMAIL_USER, EMAIL_PASS, SMTP_HOST no .env" }
  }
  try {
    const nodemailer = require("nodemailer")
    if (!transportador) {
      transportador = nodemailer.createTransport({
        host: EMAIL_CONFIG.smtp.host,
        port: EMAIL_CONFIG.smtp.port,
        secure: EMAIL_CONFIG.smtp.port === 465,
        auth: { user: EMAIL_CONFIG.smtp.user, pass: EMAIL_CONFIG.smtp.pass }
      })
    }
    const info = await transportador.sendMail({
      from: EMAIL_CONFIG.smtp.user,
      to: para,
      subject: assunto,
      text: corpo
    })
    log("INFO", "[EMAIL] Enviado", { para, assunto: assunto?.slice(0, 50), messageId: info.messageId })
    return { ok: true, messageId: info.messageId }
  } catch (err) {
    log("WARN", "[EMAIL] Erro ao enviar", { erro: err.message })
    return { ok: false, erro: err.message }
  }
}

async function ler(quantidade = 5) {
  if (!EMAIL_CONFIG.imap.user || !EMAIL_CONFIG.imap.pass) {
    return { ok: false, erro: "Email nao configurado. Defina EMAIL_USER, EMAIL_PASS, IMAP_HOST no .env" }
  }
  try {
    const Imap = require("imap")
    const { simpleParser } = require("mailparser")
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: EMAIL_CONFIG.imap.user,
        password: EMAIL_CONFIG.imap.pass,
        host: EMAIL_CONFIG.imap.host,
        port: EMAIL_CONFIG.imap.port,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
      })
      const emails = []
      imap.once("ready", () => {
        imap.openBox("INBOX", true, (err, box) => {
          if (err) { imap.end(); return reject(err) }
          const f = imap.seq.fetch(`${Math.max(1, box.messages.total - quantidade + 1)}:*`, {
            bodies: ["HEADER.FIELDS (FROM TO SUBJECT DATE)", ""],
            struct: true
          })
          f.on("message", (msg, seqno) => {
            const email = { seqno }
            msg.on("body", (stream, info) => {
              if (info.which === "") {
                simpleParser(stream, (err, parsed) => {
                  if (parsed) {
                    email.from = parsed.from?.text || ""
                    email.subject = parsed.subject || ""
                    email.date = parsed.date
                    email.text = parsed.text?.slice(0, 500) || ""
                  }
                })
              }
            })
            emails.push(email)
          })
          f.once("error", (err) => { imap.end(); reject(err) })
          f.once("end", () => { imap.end(); resolve(emails) })
        })
      })
      imap.once("error", (err) => reject(err))
      imap.connect()
    })
  } catch (err) {
    log("WARN", "[EMAIL] Erro ao ler", { erro: err.message })
    return { ok: false, erro: err.message }
  }
}

async function status() {
  const configurado = !!(EMAIL_CONFIG.smtp.user && EMAIL_CONFIG.smtp.pass)
  return {
    configurado,
    smtp: EMAIL_CONFIG.smtp.host || "nao configurado",
    imap: EMAIL_CONFIG.imap.host || "nao configurado",
    user: configurado ? EMAIL_CONFIG.smtp.user.slice(0, 3) + "***" : "N/A"
  }
}

async function parar() {
  if (transportador) {
    transportador.close()
    transportador = null
  }
}

module.exports = { configurar, enviar, ler, status, parar }
