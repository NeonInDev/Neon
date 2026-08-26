const { spawn } = require("child_process");
const fs = require("fs");
const fsP = require("fs").promises;
const path = require("path");
const os = require("os");

const MAX_LEITURA = 200 * 1024;

const PASTAS_PERMITIDAS = [
  os.homedir(),
  "C:\\Users\\Pichau\\Neon",
].map(p => path.resolve(p).toLowerCase());

function caminhoPermitido(caminho) {
  const resolved = path.resolve(caminho).toLowerCase();
  return PASTAS_PERMITIDAS.some(p => resolved.startsWith(p + path.sep) || resolved === p);
}

async function executarComando(comando) {
  const cmd = String(comando || "").trim();
  if (!cmd) return { stdout: "", stderr: "comando vazio" };
  return new Promise((resolve) => {
    const args = ["-NoProfile", "-Command", cmd];
    const proc = spawn("powershell.exe", args, {
      timeout: 60000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    proc.stdout.on("data", d => { stdout += d.toString(); });
    proc.stderr.on("data", d => { stderr += d.toString(); });
    proc.on("close", (code) => {
      resolve({ stdout, stderr, codigo: code });
    });
    proc.on("error", (err) => {
      resolve({ stdout: "", stderr: err.message, erro: err.message });
    });
  });
}

function normalizarDir(dir) {
  const d = String(dir || "").trim();
  if (!d) return os.homedir();
  try {
    return path.resolve(d);
  } catch {
    return os.homedir();
  }
}

async function listarDir(dir) {
  const alvo = normalizarDir(dir);
  let raiz = false;
  const letra = alvo.match(/^([A-Za-z]):[\\/]?$/);
  if (letra) raiz = true;

  const entradas = await fsP.readdir(alvo, { withFileTypes: true });
  const itens = await Promise.all(
    entradas.map(async (e) => {
      const caminho = path.join(alvo, e.name);
      let tamanho = 0;
      let mtime = null;
      if (e.isFile()) {
        try {
          const st = await fsP.stat(caminho);
          tamanho = st.size;
          mtime = st.mtime;
        } catch {}
      } else if (e.isDirectory()) {
        try {
          const st = await fsP.stat(caminho);
          mtime = st.mtime;
        } catch {}
      }
      return {
        nome: e.name,
        pasta: e.isDirectory(),
        tamanho,
        mtime: mtime ? mtime.getTime() : null,
      };
    })
  );

  itens.sort((a, b) => (a.pasta === b.pasta ? a.nome.localeCompare(b.nome, "pt-BR") : a.pasta ? -1 : 1));

  const raizes = [];
  for (const l of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (fs.existsSync(`${l}:\\`)) raizes.push(`${l}:\\`);
  }

  return {
    dir: alvo,
    raiz: raiz,
    raizes,
    pai: raiz ? null : path.dirname(alvo),
    itens,
  };
}

async function lerArquivo(caminho) {
  const alvo = path.resolve(String(caminho || "").trim());
  if (!caminhoPermitido(alvo)) throw new Error("acesso negado — pasta fora do sandbox");
  const st = await fsP.stat(alvo);
  if (st.isDirectory()) throw new Error("é uma pasta, não um arquivo");
  if (st.size > MAX_LEITURA) throw new Error(`arquivo muito grande (${(st.size / 1024 / 1024).toFixed(1)} MB, limite 200 KB)`);

  const buf = await fsP.readFile(alvo);
  if (buf.includes(0)) throw new Error("arquivo binário — não dá pra editar como texto");

  return { caminho: alvo, conteudo: buf.toString("utf8"), tamanho: st.size };
}

async function salvarArquivo(caminho, conteudo) {
  const alvo = path.resolve(String(caminho || "").trim());
  if (!caminhoPermitido(alvo)) throw new Error("acesso negado — pasta fora do sandbox");
  await fsP.writeFile(alvo, String(conteudo ?? ""), "utf8");
  return { ok: true, caminho: alvo };
}

async function abrirArquivo(caminho) {
  const alvo = path.resolve(String(caminho || "").trim());
  if (!fs.existsSync(alvo)) throw new Error("arquivo não existe");
  spawn("cmd.exe", ["/c", "start", "", alvo], { timeout: 5000, windowsHide: true, stdio: "ignore" });
  return { ok: true, caminho: alvo };
}

module.exports = { executarComando, listarDir, lerArquivo, salvarArquivo, abrirArquivo };
