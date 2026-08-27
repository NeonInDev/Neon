const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState, EndBehaviorType, StreamType } = require("@discordjs/voice");
const { log } = require("./logger");
const path = require("path");
const fs = require("fs");
const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(execCb);
const { OWNER } = require("./perm");
const { EdgeTTS } = require("edge-tts-universal");
const { vozPorModo } = require("./modo");

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
    const tts = require('./tts');
    const vozModo = vozPorModo();
    const mp3 = await tts.gerarAudio(limpo, vozModo);
    if (!mp3 || mp3.length === 0) throw new Error('TTS vazio');
    fs.writeFileSync(arquivo, mp3);
    const resource = createAudioResource(arquivo, { inlineVolume: true, inputType: StreamType.Arbitrary });
    resource.volume?.setVolume(1);
    player.play(resource);
    player.once(AudioPlayerStatus.Idle, () => { try { fs.unlinkSync(arquivo); } catch {} });
    return true;
  } catch (err) {
    log('WARN', '[VOZ] TTS falhou, fallback SAPI', { erro: err.message });
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

        const ffmpegPath = require("ffmpeg-static");
        const { stderr } = await execAsync(`"${ffmpegPath}" -f s16le -ar 48000 -ac 2 -i "${pcmFile}" -ar 16000 -ac 1 "${wavFile}" -y`, { timeout: 10000, windowsHide: true });

        if (!ehWavValido(wavFile)) {
          log("WARN", "[VOZ] Conversao ffmpeg invalida", { stderr: stderr?.slice(0, 300) });
          throw new Error("WAV invalido apos conversao");
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
      const benigno = /Failed to decrypt|UnencryptedWhenPassthroughDisabled/i.test(err.message || "");
      if (benigno) {
        if (!audioStream.destroyed && audioStream.readable) return;
        log("DEBUG", "[VOZ] Erro benigno de decrypt, reiniciando escuta", { erro: err.message });
      } else {
        log("WARN", "[VOZ] Erro no stream de audio", { erro: err.message });
      }
      setTimeout(() => iniciarEscuta(guildId, connection), 2000);
    });
  } catch (err) {
    log("WARN", "[VOZ] Erro ao iniciar escuta", { erro: err.message });
  }
}

function ehWavValido(caminho) {
  try {
    const buf = fs.readFileSync(caminho);
    return buf.length > 44 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE";
  } catch {
    return false;
  }
}

function lerWavSamples(wavBuf) {
  if (wavBuf.length < 44 || wavBuf.toString("ascii", 0, 4) !== "RIFF" || wavBuf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Arquivo nao e um WAV valido (sem header RIFF)");
  }
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

async function transcreverAudio(wavPath) {
  try {
    const stt = require('./stt');
    const timeout = parseInt(process.env.STT_TIMEOUT_MS, 10) || 30000;
    const res = await stt.transcribeFile(wavPath, { language: process.env.WHISPER_LANGUAGE || 'pt', timeout });
    if (res && res.text) return res.text;
    return null;
  } catch (err) {
    log('WARN', '[VOZ] STT falhou', { erro: err.message?.slice(0, 100) });
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
