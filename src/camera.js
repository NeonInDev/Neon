const { log } = require("./logger")
const axios = require("axios")
const fs = require("fs")
const path = require("path")

const CONFIG_PATH = path.join(__dirname, "..", "camera_config.json")
let config = { url: "http://192.168.1.100:8080" }

function carregarConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"))
  } catch {}
}
carregarConfig()

function salvarConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8")
}

async function capturarFrame() {
  try {
    const r = await axios.get(`${config.url}/photo.jpg`, {
      responseType: "arraybuffer",
      timeout: 10000
    })
    return r.data
  } catch (err) {
    throw new Error(`Camera: ${err.message}`)
  }
}

async function corrigirOrientacao(buf) {
  try {
    const sharp = require("sharp")
    const meta = await sharp(buf).metadata()
    if (meta.orientation && meta.orientation !== 1) {
      const corrigido = await sharp(buf).withMetadata({ orientation: 1 }).rotate().toBuffer()
      log("INFO", "[CAMERA] Orientacao corrigida", { de: meta.orientation, para: 1 })
      return corrigido
    }
    return buf
  } catch {
    return buf
  }
}

async function salvarFrameTemp() {
  let buf = await capturarFrame()
  buf = await corrigirOrientacao(buf)
  const nome = `camera_${Date.now()}.jpg`
  const caminho = path.join(__dirname, "..", "temp", nome)
  fs.mkdirSync(path.join(__dirname, "..", "temp"), { recursive: true })
  fs.writeFileSync(caminho, buf)
  return caminho
}

async function salvarFrame(caminho) {
  let buf = await capturarFrame()
  buf = await corrigirOrientacao(buf)
  fs.writeFileSync(caminho, buf)
  return caminho
}

async function definirUrl(url) {
  config.url = url.replace(/\/+$/, "")
  salvarConfig()
  log("INFO", "[CAMERA] URL configurada", { url: config.url })
  return `Camera URL definida para ${config.url}`
}

async function testar() {
  try {
    const r = await axios.get(`${config.url}/shot.jpg`, { timeout: 5000 })
    if (r.status === 200) return { ok: true, url: config.url }
  } catch {}
  try {
    const r = await axios.get(`${config.url}/photo.jpg`, { timeout: 5000 })
    if (r.status === 200) return { ok: true, url: config.url }
  } catch (err) {
    return { ok: false, erro: err.message, url: config.url }
  }
}

async function status() {
  const t = await testar()
  return {
    url: config.url,
    online: t.ok,
    snapshot: t.ok ? `${config.url}/shot.jpg` : null,
    info: "IP Webcam (Android) - configure a URL com camera_config.json"
  }
}

module.exports = { capturarFrame, salvarFrame, salvarFrameTemp, definirUrl, testar, status }
