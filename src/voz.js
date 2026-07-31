const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState, EndBehaviorType, StreamType } = require("@discordjs/voice");
const { log } = require("./logger");
const path = require("path");
const fs = require("fs");
const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(execCb);
const { OWNER } = require("./perm");
const { EdgeTTS } = require("edge-tts-universal");
const { VOZ_NEON } = require("./config");

const ATIVACAO_RE = /^\s*(neon|néon)([,\s:!.\-–—]|$)/i;
const INATIVIDADE_MS = 90_000;

let connections = new Map();
let players = new Map();
let receivers = new Map();
let conversasAtivas = new Map();

async function entrarVoz(guildId, channelId, adapter, autoConversa = true) {
  if (connections.has(guildId)) return true;

  const connection = joinVoiceChannel({
    channelId, guildId, adapterCreator: adapter,
    selfDeaf: false, selfMute: false,
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signing, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      connection.destroy();
      limpar(guildId);
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => limpar(guildId));

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    connections.set(guildId, connection);

    const player = createAudioPlayer();
    connection.subscribe(player);
    players.set(guildId, player);
    player.on("error", (err) => log("WARN", "[VOZ] Erro no player", { erro: err.message }));

    const receiver = connection.receiver;
    receivers.set(guildId, receiver);

    log("INFO", "[VOZ] Conectado", { guildId });

    if (autoConversa) {
      iniciarEscuta(guildId, connection);
    }

    return true;
  } catch (err) {
    log("WARN", "[VOZ] Falha ao conectar", { erro: err.message });
    connection.destroy();
    limpar(guildId);
    return false;
  }
}

function limpar(guildId) {
  connections.delete(guildId);
  players.delete(guildId);
  receivers.delete(guildId);
  conversasAtivas.delete(guildId);
}

async function sairVoz(guildId) {
  const connection = connections.get(guildId);
  if (connection) {
    connection.destroy();
    connections.delete(guildId);
  }
  limpar(guildId);
  return true;
}

async function falar(guildId, texto) {
  const connection = connections.get(guildId);
  const player = players.get(guildId);
  if (!connection || !player) return false;

  const limpo = texto.replace(/[*_`~|#\[\]]/g, "").slice(0, 500);
  if (!limpo) return false;

  const ts = Date.now();
  const tmp = process.env.TEMP || "C:\\Temp";
  const arquivo = path.join(tmp, `neon_vc_${ts}.mp3`);

  try {
    const tts = new EdgeTTS(limpo, VOZ_NEON);
    const resultado = await tts.synthesize();
    fs.writeFileSync(arquivo, Buffer.from(await resultado.audio.arrayBuffer()));

    if (!fs.existsSync(arquivo) || fs.statSync(arquivo).size === 0) {
      throw new Error("audio vazio");
    }

    const resource = createAudioResource(arquivo, { inlineVolume: true, inputType: StreamType.Arbitrary });
    resource.volume?.setVolume(1);
    player.play(resource);
    player.once(AudioPlayerStatus.Idle, () => { try { fs.unlinkSync(arquivo); } catch {} });
    return true;
  } catch (err) {
    log("WARN", "[VOZ] TTS edge falhou, fallback SAPI", { erro: err.message });
    try { fs.unlinkSync(arquivo); } catch {}
    return falarSapi(connection, player, limpo);
  }
}

async function falarSapi(connection, player, limpo) {
  try {
    const ts = Date.now();
    const tmp = process.env.TEMP || "C:\\Temp";
    const wavFile = path.join(tmp, `neon_vc_${ts}.wav`);
    const safe = limpo.replace(/'/g, "''").replace(/"/g, '""');
    await execAsync(`powershell -NoProfile -Command "$v = New-Object -ComObject Sapi.SpVoice; $f = New-Object -ComObject Sapi.SpFileStream; $f.Open('${wavFile}', 3, 0); $v.AudioOutputStream = $f; $v.Speak('${safe}'); $f.Close()"`, { timeout: 15000, windowsHide: true });

    if (!fs.existsSync(wavFile)) return false;

    const resource = createAudioResource(wavFile, { inlineVolume: true });
    resource.volume?.setVolume(1);
    player.play(resource);
    player.once(AudioPlayerStatus.Idle, () => { try { fs.unlinkSync(wavFile); } catch {} });
    return true;
  } catch (err) {
    log("WARN", "[VOZ] SAPI falhou", { erro: err.message });
    return false;
  }
}

async function iniciarEscuta(guildId, connection) {
  const receiver = receivers.get(guildId);
  if (!receiver || !connections.has(guildId)) return;

  log("INFO", "[VOZ] Ouvindo o dono (diga 'Neon' para ativar)", { guildId });

  try {
    const audioStream = receiver.subscribe(OWNER, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 1500 },
    });

    const chunks = [];
    audioStream.on("data", (chunk) => chunks.push(chunk));
    audioStream.on("end", async () => {
      const temConversa = conversasAtivas.has(guildId);

      if (chunks.length === 0) {
        if (temConversa && Date.now() - conversasAtivas.get(guildId) > INATIVIDADE_MS) {
          pararConversa(guildId);
          log("INFO", "[VOZ] Conversa encerrada por inatividade", { guildId });
        }
        setTimeout(() => iniciarEscuta(guildId, connection), 1000);
        return;
      }

      const ts = Date.now();
      const tmp = process.env.TEMP || "C:\\Temp";
      const pcmFile = path.join(tmp, `neon_in_${ts}.pcm`);
      const wavFile = path.join(tmp, `neon_in_${ts}.wav`);

      try {
        const buf = Buffer.concat(chunks);
        fs.writeFileSync(pcmFile, buf);

        await execAsync(`powershell -NoProfile -Command "$ff = 'C:\\ffmpeg\\ffmpeg.exe'; if (Test-Path $ff) { & $ff -f s16le -ar 48000 -ac 2 -i '${pcmFile}' -ar 16000 -ac 1 '${wavFile}' -y } else { copy '${pcmFile}' '${wavFile}' }"`, { timeout: 10000, windowsHide: true });

        if (!fs.existsSync(wavFile)) {
          fs.renameSync(pcmFile, wavFile);
        }

        const texto = await transcreverAudio(wavFile);
        try { fs.unlinkSync(pcmFile); } catch {}
        try { fs.unlinkSync(wavFile); } catch {}

        if (texto && texto.length > 1) {
          log("INFO", "[VOZ] Transcricao", { texto: texto.slice(0, 100) });
          let pergunta = texto;
          const ativou = ATIVACAO_RE.test(pergunta);

          if (ativou) {
            pergunta = pergunta.replace(ATIVACAO_RE, "").trim() || "oi";
            conversasAtivas.set(guildId, Date.now());
          } else if (temConversa) {
            conversasAtivas.set(guildId, Date.now());
          }

          if (conversasAtivas.has(guildId)) {
            const { askNeon } = require("./ai");
            const reply = await askNeon(OWNER, "dono", pergunta);
            if (reply) await falar(guildId, reply);
          }
        }
      } catch (err) {
        log("WARN", "[VOZ] Erro no audio", { erro: err.message });
        try { fs.unlinkSync(pcmFile); } catch {}
        try { fs.unlinkSync(wavFile); } catch {}
      }

      setTimeout(() => iniciarEscuta(guildId, connection), 1000);
    });

    audioStream.on("error", (err) => {
      log("WARN", "[VOZ] Erro no stream de audio", { erro: err.message });
      setTimeout(() => iniciarEscuta(guildId, connection), 2000);
    });
  } catch (err) {
    log("WARN", "[VOZ] Erro ao iniciar escuta", { erro: err.message });
  }
}

function lerWavSamples(wavBuf) {
  let dataOffset = 12;
  while (dataOffset + 8 <= wavBuf.length) {
    const chunkId = wavBuf.toString("ascii", dataOffset, dataOffset + 4);
    const chunkSize = wavBuf.readUInt32LE(dataOffset + 4);
    if (chunkId === "data") {
      const sampleStart = dataOffset + 8;
      const numSamples = Math.floor(chunkSize / 2);
      const samples = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        samples[i] = wavBuf.readInt16LE(sampleStart + i * 2) / 32768.0;
      }
      return samples;
    }
    dataOffset += 8 + chunkSize;
  }
  throw new Error("Chunk data nao encontrado no WAV");
}

let whisperPipeline = null;

async function transcreverLocal(wavPath) {
  try {
    if (!whisperPipeline) {
      log("INFO", "[VOZ] Carregando Whisper local");
      const { pipeline } = require("@xenova/transformers");
      const modelo = process.env.WHISPER_MODEL || "Xenova/whisper-small";
      whisperPipeline = await pipeline("automatic-speech-recognition", modelo, { quantized: true });
      log("INFO", "[VOZ] Whisper local pronto");
    }
    const result = await whisperPipeline(lerWavSamples(fs.readFileSync(wavPath)), {
      language: process.env.WHISPER_LANGUAGE || "pt",
      task: "transcribe",
      sampling_rate: 16000,
    });
    return result?.text?.trim() || null;
  } catch (err) {
    log("WARN", "[VOZ] Whisper local falhou", { erro: err.message?.slice(0, 100) });
    return null;
  }
}

async function transcreverAudio(wavPath) {
  const { GROQ_API_KEY, DEEPSEEK_API_KEY } = require("./config");

  const local = await transcreverLocal(wavPath);
  if (local) return local;

  if (GROQ_API_KEY) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const blob = new Blob([fs.readFileSync(wavPath)], { type: "audio/wav" });
      const form = new FormData();
      form.append("file", blob, "audio.wav");
      form.append("model", "whisper-large-v3-turbo");
      form.append("language", "pt");
      form.append("response_format", "json");
      const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (resp.ok) {
        const data = await resp.json();
        const texto = data?.text?.trim();
        if (texto) return texto;
      }
      log("WARN", "[VOZ] Groq HTTP", { status: resp.status });
    } catch (err) {
      log("WARN", "[VOZ] Groq falhou", { erro: err.message?.slice(0, 100) });
    }
  }

  try {
    const axios = require("axios");
    const fs2 = require("fs");
    const FormData = require("form-data");

    const form = new FormData();
    form.append("file", fs2.createReadStream(wavPath), "audio.wav");
    form.append("model", "whisper-1");

    const resp = await axios.post("https://api.deepseek.com/v1/audio/transcriptions", form, {
      headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, ...form.getHeaders() },
      timeout: 30000,
    });
    return resp?.data?.text?.trim();
  } catch (err) {
    log("WARN", "[VOZ] STT falhou", { erro: err.message?.slice(0, 100) });
    return null;
  }
}

async function iniciarConversa(guildId) {
  const connection = connections.get(guildId);
  if (!connection) return false;
  conversasAtivas.set(guildId, Date.now());
  iniciarEscuta(guildId, connection);
  return true;
}

function pararConversa(guildId) {
  conversasAtivas.delete(guildId);
}

function estaEmConversa(guildId) {
  return conversasAtivas.has(guildId);
}

function status() {
  const guilds = [];
  for (const [guildId, connection] of connections) {
    guilds.push({
      guildId,
      estado: connection.state.status,
      conversa: conversasAtivas.has(guildId),
    });
  }
  return guilds;
}

module.exports = { entrarVoz, sairVoz, falar, iniciarConversa, pararConversa, estaEmConversa, status };
