const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const { log } = require("./logger");
const execAsync = promisify(execCb);

function encontrarBlender() {
  const candidatos = [
    "blender",
    "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe",
    `${process.env.LOCALAPPDATA}\\Blender Foundation\\Blender 5.1\\blender.exe`,
    `${process.env.LOCALAPPDATA}\\Blender Foundation\\Blender 4.2\\blender.exe`,
    `${process.env.LOCALAPPDATA}\\Blender Foundation\\Blender 4.5\\blender.exe`,
  ];
  for (const c of candidatos) {
    try {
      if (c === "blender") {
        const r = require("child_process").execSync("where blender", { timeout: 2000, windowsHide: true });
        const p = r.toString().trim().split("\n")[0];
        if (p && fs.existsSync(p)) return p;
      } else if (fs.existsSync(c)) {
        return c;
      }
    } catch {}
  }
  return null;
}

async function abrir(arquivo) {
  const blender = encontrarBlender();
  if (!blender) return { ok: false, msg: "Blender não encontrado. Instale pelo Instalador_Neon." };
  const args = arquivo ? ` "${arquivo}"` : "";
  try {
    await execAsync(`start "" "${blender}"${args}`, { timeout: 5000 });
    return { ok: true, msg: `Blender aberto${arquivo ? ` com: ${path.basename(arquivo)}` : ""}.` };
  } catch (err) {
    return { ok: false, msg: `Erro ao abrir Blender: ${err.message}` };
  }
}

async function renderizar(arquivo, frame = 1, saida) {
  const blender = encontrarBlender();
  if (!blender) return { ok: false, msg: "Blender não encontrado." };
  if (!fs.existsSync(arquivo)) return { ok: false, msg: `Arquivo não encontrado: ${arquivo}` };
  const output = saida || path.join(path.dirname(arquivo), `render_frame_${frame}.png`);
  try {
    const { stdout, stderr } = await execAsync(`"${blender}" -b "${arquivo}" -o "${output}" -f ${frame}`, {
      timeout: 300000,
      windowsHide: true,
    });
    const saidaFinal = output.replace(/#+/, `${String(frame).padStart(4, "0")}`);
    return { ok: true, msg: `Renderizado frame ${frame} em: ${saidaFinal}`, stdout: stdout?.slice(0, 500), stderr: stderr?.slice(0, 500) };
  } catch (err) {
    return { ok: false, msg: `Erro no render: ${err.message?.slice(0, 200)}` };
  }
}

async function exportar(arquivo, formato = "obj") {
  const blender = encontrarBlender();
  if (!blender) return { ok: false, msg: "Blender não encontrado." };
  if (!fs.existsSync(arquivo)) return { ok: false, msg: `Arquivo não encontrado: ${arquivo}` };
  const ext = formato.replace(/^\./, "").toLowerCase();
  const saida = arquivo.replace(/\.blend$/i, `.${ext}`);
  const script = `
import bpy
bpy.ops.wm.open_mainfile(filepath="${arquivo.replace(/\\/g, "\\\\")}")
bpy.ops.export_scene.${ext}(filepath="${saida.replace(/\\/g, "\\\\")}")
`;
  const scriptPath = path.join(require("os").tmpdir(), "neon_blender_export.py");
  try {
    fs.writeFileSync(scriptPath, script, "utf8");
    const { stdout, stderr } = await execAsync(`"${blender}" -b --python "${scriptPath}"`, {
      timeout: 120000,
      windowsHide: true,
    });
    return { ok: true, msg: `Exportado para ${saida}`, stdout: stdout?.slice(0, 500) };
  } catch (err) {
    return { ok: false, msg: `Erro na exportação: ${err.message?.slice(0, 200)}` };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
  }
}

module.exports = { encontrarBlender, abrir, renderizar, exportar };
