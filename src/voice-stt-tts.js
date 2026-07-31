const fs = require('fs');
const path = require('path');
const { exec: execCb } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(execCb);
const { log } = require('./logger');

const TMP = process.env.TEMP || 'C:\\Temp';

async function pcmBufferToWav(pcmPath) {
  const wavPath = pcmPath.replace(/\.pcm$/i, '.wav');
  const ffmpeg = require('ffmpeg-static');
  try {
    await execAsync(`"${ffmpeg}" -f s16le -ar 48000 -ac 2 -i "${pcmPath}" -ar 16000 -ac 1 "${wavPath}" -y`, { timeout: 20000, windowsHide: true });
    return wavPath;
  } catch (err) {
    log('WARN', '[VOICE-STT-TTS] ffmpeg conversao falhou', { erro: err.message });
    return null;
  }
}

async function processDiscordPCM(pcmBuffer, opts = {}) {
  // opts: { language, onResponse: async (mp3Buffer) => {} }
  const ts = Date.now();
  const pcmPath = path.join(TMP, `neon_vs_${ts}.pcm`);
  try {
    fs.writeFileSync(pcmPath, pcmBuffer);
    const wavPath = await pcmBufferToWav(pcmPath);
    if (!wavPath) throw new Error('wav_convert_failed');

    const stt = require('./stt');
    const tts = require('./tts');
    const language = opts.language || process.env.WHISPER_LANGUAGE || 'pt';

    const res = await stt.transcribeFile(wavPath, { language, timeout: parseInt(process.env.STT_TIMEOUT_MS, 10) || 30000 });
    if (!res || !res.text) {
      log('INFO', '[VOICE-STT-TTS] Sem transcricao');
      return { ok: false };
    }

    log('INFO', '[VOICE-STT-TTS] Texto transcrito', { texto: res.text.slice(0, 120), provider: res.provider });

    // Allow caller to handle the transcribed text (e.g. send to AI)
    if (opts.onText) {
      await opts.onText(res.text);
    }

    const ai = require('./ai');
    const reply = await ai.askNeon(opts.userId || 'vc', opts.userName || 'Usuario', res.text);
    if (!reply) return { ok: false };

    // generate TTS
    const voz = opts.voz || process.env.TTS_VOICE_DEFAULT || 'pt-BR-FranciscaNeural';
    const velocidade = opts.velocidade || 1.0;
    const mp3 = await tts.gerarAudio(reply, voz, velocidade);
    if (!mp3) return { ok: false };

    if (opts.onResponse) {
      await opts.onResponse(mp3);
    }

    return { ok: true, text: res.text, reply, mp3 };
  } catch (err) {
    log('ERROR', '[VOICE-STT-TTS] Erro processando PCM', { erro: err.message });
    return { ok: false, erro: err.message };
  } finally {
    try { fs.unlinkSync(pcmPath) } catch {}
    try { fs.unlinkSync(pcmPath.replace(/\.pcm$/i, '.wav')) } catch {}
  }
}

module.exports = { processDiscordPCM };
