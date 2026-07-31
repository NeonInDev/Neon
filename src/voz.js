const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState, EndBehaviorType } = require("@discordjs/voice");
const { log } = require("./logger");
const path = require("path");
const fs = require("fs");
const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(execCb);
const { OWNER } = require("./perm");

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
      conversasAtivas.set(guildId, true);
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
    log("WARN", "[VOZ] Falha ao falar", { erro: err.message });
    return false;
  }
}

async function iniciarEscuta(guildId, connection) {
  const receiver = receivers.get(guildId);
  if (!receiver) return;

  log("INFO", "[VOZ] Iniciando escuta do dono", { guildId });

  try {
    const audioStream = receiver.subscribe(OWNER, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 1500 },
    });

    const chunks = [];
    audioStream.on("data", (chunk) => chunks.push(chunk));
    audioStream.on("end", async () => {
      if (chunks.length === 0) {
        if (conversasAtivas.has(guildId)) {
          setTimeout(() => iniciarEscuta(guildId, connection), 1000);
        }
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
          const { askNeon } = require("./ai");
          const reply = await askNeon(OWNER, "dono", texto);
          if (reply) await falar(guildId, reply);
        }
      } catch (err) {
        log("WARN", "[VOZ] Erro no audio", { erro: err.message });
        try { fs.unlinkSync(pcmFile); } catch {}
        try { fs.unlinkSync(wavFile); } catch {}
      }

      if (conversasAtivas.has(guildId)) {
        setTimeout(() => iniciarEscuta(guildId, connection), 1000);
      }
    });

    audioStream.on("error", (err) => {
      log("WARN", "[VOZ] Erro no stream de audio", { erro: err.message });
      if (conversasAtivas.has(guildId)) {
        setTimeout(() => iniciarEscuta(guildId, connection), 2000);
      }
    });
  } catch (err) {
    log("WARN", "[VOZ] Erro ao iniciar escuta", { erro: err.message });
  }
}

async function transcreverAudio(wavPath) {
  try {
    const axios = require("axios");
    const { DEEPSEEK_API_KEY } = require("./config");
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
  conversasAtivas.set(guildId, true);
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
