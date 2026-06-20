const { log } = require("./logger");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(execCb);

async function pesquisarOnline(consulta) {
  try {
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(consulta + " 3D model free download stl")}`;
    const { data } = await axios.get(url, { timeout: 10000 });
    const links = [];
    const linkMatches = data.match(/<a[^>]+class="result-link"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi) || [];
    for (const a of linkMatches) {
      const href = a.match(/href="([^"]*)"/)?.[1];
      const text = a.replace(/<[^>]+>/g, "").trim();
      if (href && text) links.push({ nome: text, url: href });
    }
    const sugestoes = links.filter(l => /(sketchfab|thingiverse|cgtrader|free3d|turbosquid|printables|thangs)/i.test(l.url)).slice(0, 5);
    return sugestoes.length ? sugestoes : links.slice(0, 5);
  } catch (err) {
    log("WARN", "[3D] Erro ao pesquisar online", { erro: err.message });
    return [];
  }
}

async function gerarPorPrompt(prompt) {
  const blender = require("./blender");
  const { gerarBlenderScript } = require("./opencode");
  const scriptPython = await gerarBlenderScript(`que: ${prompt}. Crie um arquivo .blend salvo em temp/modelo3d.blend. Use bpy.ops.wm.save_mainfile() no final.`);
  if (!scriptPython || scriptPython.startsWith("Erro OpenCode")) {
    return { ok: false, msg: `Erro ao gerar script: ${scriptPython}` };
  }
  const saida = path.join(__dirname, "..", "temp", "modelo3d.blend");
  if (!fs.existsSync(path.join(__dirname, "..", "temp"))) fs.mkdirSync(path.join(__dirname, "..", "temp"), { recursive: true });
  const scriptComSaida = scriptPython + `\nbpy.ops.wm.save_mainfile(filepath="${saida.replace(/\\/g, "\\\\")}")`;
  const r = await blender.executarScript(scriptComSaida);
  if (r.ok && fs.existsSync(saida)) {
    return { ok: true, msg: `Modelo 3D gerado e salvo em: ${saida}`, caminho: saida };
  }
  return { ok: false, msg: r.msg || "Falha ao gerar modelo 3D." };
}

async function gerarPrimitivo(tipo, params = {}) {
  const blender = require("./blender");
  const tamanho = params.tamanho || 1;
  const localizacao = params.localizacao || "(0, 0, 0)";
  const cmd = `bpy.ops.mesh.primitive_${tipo}_add(size=${tamanho}, location=${localizacao})`;
  const r = await blender.executarComando(cmd);
  return r.ok ? { ok: true, msg: `Primitivo ${tipo} adicionado no Blender.` } : r;
}

module.exports = { pesquisarOnline, gerarPorPrompt, gerarPrimitivo };