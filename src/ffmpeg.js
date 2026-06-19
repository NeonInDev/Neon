const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const fs = require("fs");
const { log } = require("./logger");
const exec = promisify(execCb);
const FFMPEG = "C:\\ffmpeg\\ffmpeg.exe";
const FFPROBE = "C:\\ffmpeg\\ffprobe.exe";

async function converter(input, output, options = "") {
  const cmd = `"${FFMPEG}" -i "${input}" ${options} -y "${output}"`;
  log("INFO", "[FFMPEG] convertendo", { cmd });
  const { stdout, stderr } = await exec(cmd, { timeout: 300000 });
  return { ok: true, stdout, stderr };
}

async function extrairAudio(input, output) {
  const ext = path.extname(output) || ".mp3";
  const saida = ext ? output : output + ".mp3";
  return converter(input, saida, "-vn -acodec libmp3lame -q:a 4");
}

async function cortarVideo(input, inicio, duracao, output) {
  const saida = output || `cortado_${Date.now()}.mp4`;
  return converter(input, saida, `-ss ${inicio} -t ${duracao} -c copy`);
}

async function comprimirVideo(input, output, qualidade = 28) {
  const saida = output || `comprimido_${Date.now()}.mp4`;
  return converter(input, saida, `-vcodec libx264 -crf ${qualidade} -preset fast`);
}

async function gif(input, output, fps = 10, scale = 480) {
  const saida = output || `animado_${Date.now()}.gif`;
  return converter(input, saida, `-vf "fps=${fps},scale=${scale}:-1:flags=lanczos" -loop 0`);
}

async function info(input) {
  const cmd = `"${FFPROBE}" -v quiet -print_format json -show_format -show_streams "${input}"`;
  const { stdout } = await exec(cmd, { timeout: 30000 });
  return JSON.parse(stdout);
}

async function screenshot(input, time = "00:00:01", output) {
  const saida = output || `screenshot_${Date.now()}.png`;
  return converter(input, saida, `-ss ${time} -vframes 1`);
}

async function redimensionar(input, resolucao, output) {
  return converter(input, output || `redimensionado_${Date.now()}.mp4`, `-vf "scale=${resolucao}"`);
}

async function disponivel() {
  try {
    await exec(`"${FFMPEG}" -version`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

module.exports = { converter, extrairAudio, cortarVideo, comprimirVideo, gif, info, screenshot, redimensionar, disponivel };