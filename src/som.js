const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const { log } = require("./logger");

const PASTA = path.join(__dirname, "..", "data", "sons");
const NOMES = new Set(["ligar", "online", "desligar", "notificar", "erro", "mensagem"]);

// Toca um efeito sonoro nos alto-falantes do PC (nao bloqueia)
function tocar(nome) {
  if (process.env.RENDER) return { ok: false, motivo: "sem audio no servidor" };
  if (!NOMES.has(nome)) nome = "notificar";
  const arquivo = path.join(PASTA, nome + ".wav");
  if (!fs.existsSync(arquivo)) {
    // gera na primeira vez se faltar
    try {
      require("../scripts/gerar_sons.js");
    } catch {}
  }
  try {
    const ps = spawn(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Add-Type -AssemblyName presentationCore; $p=New-Object System.Windows.Media.MediaPlayer; $p.Open([Uri]::new('${arquivo.replace(/'/g, "''")}')); Start-Sleep -Milliseconds 300; $p.Play(); Start-Sleep -Seconds 3; $p.Close()`,
      ],
      { detached: true, stdio: "ignore" }
    );
    ps.unref();
    log("DEBUG", "[SOM] tocando", { som: nome });
    return { ok: true, som: nome };
  } catch (e) {
    log("WARN", "[SOM] falha ao tocar", { erro: e.message?.slice(0, 80) });
    return { ok: false, erro: e.message };
  }
}

function listar() {
  try {
    return fs.readdirSync(PASTA).filter((f) => f.endsWith(".wav")).map((f) => f.replace(".wav", ""));
  } catch {
    return [];
  }
}

module.exports = { tocar, listar, NOMES };
