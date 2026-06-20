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

const acao = process.argv[2]
const args = process.argv.slice(3)

if (acao === "cripitar") {
  const [entrada, saida, senha] = args
  if (!entrada || !saida || !senha) { console.error("Uso: node cripitar.js cripitar <entrada> <saida> <senha>"); process.exit(1) }
  cripitar(entrada, saida, senha)
} else if (acao === "decripitar") {
  const [entrada, saida, senha] = args
  if (!entrada || !saida || !senha) { console.error("Uso: node cripitar.js decripitar <entrada> <saida> <senha>"); process.exit(1) }
  decripitar(entrada, saida, senha)
} else {
  // Modo interativo
  const readline = require("readline")
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const pergunta = (q) => new Promise(r => rl.question(q, r))

  ;(async () => {
    const acao2 = await pergunta("Acao (cripitar/decripitar): ")
    const entrada = await pergunta("Arquivo de entrada: ")
    const saida = await pergunta("Arquivo de saida: ")
    const s1 = await pergunta("Senha: ")
    if (acao2 === "cripitar") {
      cripitar(entrada, saida, s1)
    } else {
      decripitar(entrada, saida, s1)
    }
    rl.close()
  })()
}
