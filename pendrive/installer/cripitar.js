const crypto = require("crypto")
const fs = require("fs")

const ALGO = "aes-256-gcm"
const SALT_LEN = 16
const IV_LEN = 16
const TAG_LEN = 16
const KEY_LEN = 32
const ITER = 600000
const MAGIC = "NEON_ENC"
const DIGEST = "sha256"

function derivar(senha, salt) {
  return crypto.pbkdf2Sync(senha, salt, ITER, KEY_LEN, DIGEST)
}

function cripitar(entrada, saida, senha) {
  const dados = fs.readFileSync(entrada)
  const salt = crypto.randomBytes(SALT_LEN)
  const key = derivar(senha, salt)
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const cip = Buffer.concat([cipher.update(dados), cipher.final()])
  const tag = cipher.getAuthTag()
  const buf = Buffer.concat([
    Buffer.from(MAGIC, "utf8"),
    Buffer.from([SALT_LEN]), salt,
    Buffer.from([IV_LEN]), iv,
    Buffer.from([TAG_LEN]), tag,
    cip
  ])
  fs.writeFileSync(saida, buf)
  console.log(`[OK] Criptografado: ${saida}`)
}

function decripitar(entrada, saida, senha) {
  const buf = fs.readFileSync(entrada)
  let off = 0
  const magic = buf.slice(off, off + 8).toString("utf8"); off += 8
  if (magic !== MAGIC) throw new Error("Arquivo invalido (magic)")
  const saltLen = buf[off]; off++
  const salt = buf.slice(off, off + saltLen); off += saltLen
  const ivLen = buf[off]; off++
  const iv = buf.slice(off, off + ivLen); off += ivLen
  const tagLen = buf[off]; off++
  const tag = buf.slice(off, off + tagLen); off += tagLen
  const cip = buf.slice(off)
  const key = derivar(senha, salt)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(cip), decipher.final()])
  fs.writeFileSync(saida, plain)
  console.log(`[OK] Decriptado: ${saida}`)
}

// ── CLI ──
if (process.argv.length >= 5) {
  // Old style: node cripitar.js <acao> <entrada> <saida> <senha>
  const acao = process.argv[2]
  const [entrada, saida, senha] = process.argv.slice(3)
  if (!entrada || !saida || !senha) { console.error("Uso: node cripitar.js <acao> <entrada> <saida> <senha>"); process.exit(1) }
  if (acao === "cripitar") cripitar(entrada, saida, senha)
  else if (acao === "decripitar") decripitar(entrada, saida, senha)
  else { console.error("Acao invalida. Use cripitar ou decripitar."); process.exit(1) }
} else {
  // Stdin JSON: echo '{"action":"...","input":"...","output":"...","password":"..."}' | node cripitar.js
  let stdinData = ""
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", chunk => stdinData += chunk)
  process.stdin.on("end", () => {
    try {
      const opts = JSON.parse(stdinData)
      if (!opts.action || !opts.input || !opts.output || !opts.password) {
        console.error('Stdin JSON deve ter: action, input, output, password'); process.exit(1)
      }
      if (opts.action === "encrypt" || opts.action === "cripitar") cripitar(opts.input, opts.output, opts.password)
      else if (opts.action === "decrypt" || opts.action === "decripitar") decripitar(opts.input, opts.output, opts.password)
      else { console.error("Acao invalida"); process.exit(1) }
    } catch (e) {
      console.error("Erro ao parsear stdin:", e.message); process.exit(1)
    }
  })
}
