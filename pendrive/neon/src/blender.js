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
    "C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe",
    `${process.env.LOCALAPPDATA}\\Blender Foundation\\Blender 5.1\\blender.exe`,
    `${process.env.LOCALAPPDATA}\\Blender Foundation\\Blender 4.2\\blender.exe`,
    `${process.env.LOCALAPPDATA}\\Blender Foundation\\Blender 4.5\\blender.exe`,
    `${process.env.PROGRAMFILES}\\Blender Foundation\\Blender 5.1\\blender.exe`,
    "C:\\Program Files\\Blender Foundation\\Blender 3.6\\blender.exe",
    `${process.env.LOCALAPPDATA}\\Blender Foundation\\Blender 3.6\\blender.exe`,
  ];
  for (const c of candidatos) {
    try {
      if (c === "blender") {
        const r = require("child_process").execSync("where blender", { timeout: 2000, windowsHide: true });
        const p = r.toString().trim().split("\n")[0];
        if (p && fs.existsSync(p)) return p;
      } else if (fs.existsSync(c)) return c;
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

async function executarScript(scriptPy) {
  const blender = encontrarBlender();
  if (!blender) return { ok: false, msg: "Blender não encontrado." };
  const scriptPath = path.join(require("os").tmpdir(), "neon_blender_gen.py");
  try {
    fs.writeFileSync(scriptPath, scriptPy, "utf8");
    const { stdout, stderr } = await execAsync(`"${blender}" --background --python "${scriptPath}"`, {
      timeout: 180000,
      windowsHide: true,
    });
    return { ok: true, msg: "Script executado com sucesso.", stdout: stdout?.slice(0, 1000), stderr: stderr?.slice(0, 500) };
  } catch (err) {
    return { ok: false, msg: `Erro no script Blender: ${err.message?.slice(0, 300)}` };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
  }
}

async function executarComando(texto) {
  const blender = encontrarBlender();
  if (!blender) return { ok: false, msg: "Blender não encontrado." };
  const scriptPath = path.join(require("os").tmpdir(), "neon_blender_cmd.py");
  try {
    const script = `import bpy\n${texto}\n`;
    fs.writeFileSync(scriptPath, script, "utf8");
    const { stdout, stderr } = await execAsync(`"${blender}" --background --python "${scriptPath}"`, {
      timeout: 120000,
      windowsHide: true,
    });
    return { ok: true, msg: "Comando executado.", stdout: stdout?.slice(0, 1000), stderr: stderr?.slice(0, 500) };
  } catch (err) {
    return { ok: false, msg: `Erro: ${err.message?.slice(0, 300)}` };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
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

// ===================== LOOP AUTÔNOMO: IA → SCRIPT → EXEC → AVALIA =====================

async function gerarPromptSistema() {
  return `Você é um especialista em Blender 3D e geração de scripts Python para Blender.
Gere APENAS o código Python que será executado no Blender.
Use a API bpy para criar/alterar a cena.
IMPORTANTE:
- Use sempre bpy.ops.wm.open_mainfile(filepath="//") no inicio se for modificar cena existente
- Para criar cena nova: bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
- Adicione materiais, iluminação e câmera se necessário
- No final, salve com: bpy.ops.wm.save_mainfile(filepath="//output.blend")
- Retorne APENAS o código Python, sem explicações`;
}

async function gerarComAutonomia(descricao) {
  const blender = encontrarBlender();
  if (!blender) return { ok: false, msg: "Blender não encontrado." };

  const { GEMINI_API_KEY } = require("./config");
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "coloque_sua_chave_aqui") {
    return { ok: false, msg: "Precisa de chave Gemini configurada para geração autônoma." };
  }

  const axios = require("axios");
  const outputPath = path.join(require("os").tmpdir(), "neon_blender_output.blend");
  const tempDir = require("os").tmpdir();

  log("INFO", "[BLENDER] Gerando modelo autonomamente", { descricao: descricao.slice(0, 100) });

  const maxIteracoes = 3;
  let resultadoFinal = "";

  try {
    for (let iter = 0; iter < maxIteracoes; iter++) {
      const systemPrompt = await gerarPromptSistema();
      const userPrompt = iter === 0
        ? `Crie no Blender: ${descricao}. Salve o resultado em "${outputPath.replace(/\\/g, "\\\\")}"`
        : `O código anterior teve este resultado:\n${resultadoFinal}\n\nCorrija o código e tente novamente. Crie: ${descricao}. Salve em "${outputPath.replace(/\\/g, "\\\\")}"`;

      const resp = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.3 },
        },
        { timeout: 30000 }
      );

      const codigo = resp?.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!codigo) {
        resultadoFinal = "Falha ao gerar código Python";
        continue;
      }

      const codigoLimpo = codigo.replace(/```python\n?/gi, "").replace(/```/g, "").trim();
      const scriptPath = path.join(tempDir, `neon_blender_auto_${iter}.py`);
      fs.writeFileSync(scriptPath, codigoLimpo, "utf8");

      try {
        const { stdout, stderr } = await execAsync(`"${blender}" --background --python "${scriptPath}"`, {
          timeout: 120000,
          windowsHide: true,
        });
        resultadoFinal = stdout?.slice(0, 500) || "ok";
        if (stderr) resultadoFinal += "\nSTDERR: " + stderr.slice(0, 500);

        if (fs.existsSync(outputPath)) {
          return {
            ok: true,
            msg: `✅ Modelo "${descricao}" criado com sucesso! (${iter + 1} iteração(ões))`,
            arquivo: outputPath,
            stdout: resultadoFinal.slice(0, 500),
          };
        }
      } catch (err) {
        resultadoFinal = `Erro na execução: ${err.message?.slice(0, 300)}`;
      } finally {
        try { fs.unlinkSync(scriptPath); } catch {}
      }
    }

    return {
      ok: true,
      msg: `⚠️ Geração concluída após ${maxIteracoes} tentativas, mas arquivo não encontrado. Último resultado:\n${resultadoFinal.slice(0, 500)}`,
    };
  } catch (err) {
    return { ok: false, msg: `Erro na geração autônoma: ${err.message?.slice(0, 300)}` };
  }
}

// =================AM CAPTURA DE VIEWPORT =================

async function capturarViewport(arquivo) {
  const blender = encontrarBlender();
  if (!blender) return { ok: false, msg: "Blender não encontrado." };
  const outputImg = path.join(require("os").tmpdir(), "neon_blender_viewport.png");
  const script = `
import bpy
if "${arquivo}":
    bpy.ops.wm.open_mainfile(filepath="${arquivo.replace(/\\/g, "\\\\")}")
bpy.context.scene.render.filepath = "${outputImg.replace(/\\/g, "\\\\")}"
bpy.ops.render.opengl(write_still=True)
`;
  const scriptPath = path.join(require("os").tmpdir(), "neon_blender_viewport.py");
  try {
    fs.writeFileSync(scriptPath, script, "utf8");
    await execAsync(`"${blender}" --background --python "${scriptPath}"`, { timeout: 60000, windowsHide: true });
    if (fs.existsSync(outputImg)) {
      const base64 = fs.readFileSync(outputImg, { encoding: "base64" });
      return { ok: true, msg: "Viewport capturado", arquivo: outputImg, base64 };
    }
    return { ok: false, msg: "Falha ao capturar viewport" };
  } catch (err) {
    return { ok: false, msg: `Erro: ${err.message}` };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
  }
}

module.exports = { encontrarBlender, abrir, renderizar, exportar, executarScript, executarComando, gerarComAutonomia, capturarViewport };
