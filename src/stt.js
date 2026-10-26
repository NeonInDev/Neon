const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

const MODEL_CACHE = new Map();
const APP_ROOT = path.resolve(__dirname, '..');
const MODEL_CACHE_DIR = path.join(APP_ROOT, '.neon-opencode', 'models-cache');
const DEFAULT_MODEL = process.env.NEON_STT_MODEL || 'Xenova/whisper-small';
const DEFAULT_LANG = process.env.WHISPER_LANGUAGE || 'pt';
const DEFAULT_TIMEOUT = Math.max(120000, parseInt(process.env.STT_TIMEOUT_MS, 10) || 0);

function lerWavSamples(wavBuf) {
  if (wavBuf.length < 44 || wavBuf.toString('ascii', 0, 4) !== 'RIFF' || wavBuf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Arquivo nao e um WAV valido (sem header RIFF)');
  }
  let dataOffset = 12;
  while (dataOffset + 8 <= wavBuf.length) {
    const chunkId = wavBuf.toString('ascii', dataOffset, dataOffset + 4);
    const chunkSize = wavBuf.readUInt32LE(dataOffset + 4);
    if (chunkId === 'data') {
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
  throw new Error('Chunk data nao encontrado no WAV');
}

async function loadWhisper(model) {
  model = model || DEFAULT_MODEL;
  if (MODEL_CACHE.has(model)) return MODEL_CACHE.get(model);
  const loading = (async () => {
    fs.mkdirSync(MODEL_CACHE_DIR, { recursive: true });
    const { env, pipeline } = require('@xenova/transformers');
    env.cacheDir = MODEL_CACHE_DIR;
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    log('INFO', '[STT] Carregando modelo Whisper local/offline', { modelo: model });
    const p = await pipeline('automatic-speech-recognition', model, { quantized: true });
    log('INFO', '[STT] Modelo Whisper local pronto', { modelo: model });
    return p;
  })().catch((err) => {
    MODEL_CACHE.delete(model);
    log('ERROR', '[STT] Modelo offline ausente ou inválido; execute npm run neon:stt:model', { erro: err.message?.slice(0, 200) });
    throw err;
  });
  MODEL_CACHE.set(model, loading);
  return loading;
}

function timeoutPromise(ms, message) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error(message || 'timeout')), ms));
}

async function transcribeWithWhisper(wavPath, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const language = opts.language || DEFAULT_LANG;
  const timeoutMs = opts.timeout || DEFAULT_TIMEOUT;
  try {
    const pipeline = await loadWhisper(model);
    if (!pipeline) throw new Error('whisper_unavailable');
    const wavBuf = fs.readFileSync(wavPath);
    const samples = lerWavSamples(wavBuf);
    log('INFO', '[STT] Whisper local processando', { amostras: samples.length, idioma: language });
    const call = pipeline(samples, { language, task: 'transcribe' });
    const result = await Promise.race([call, timeoutPromise(timeoutMs, 'whisper_timeout')]);
    const text = (result && result.text) ? result.text.trim() : null;
    return { text, provider: 'whisper_local' };
  } catch (err) {
    log('WARN', '[STT] Whisper local falhou', { erro: err.message?.slice(0, 200) });
    return null;
  }
}

async function transcribeFile(wavPath, opts = {}) {
  const language = opts.language || DEFAULT_LANG;
  const timeout = opts.timeout || DEFAULT_TIMEOUT;
  return transcribeWithWhisper(wavPath, { language, model: opts.model, timeout });
}

module.exports = { transcribeFile, transcribeWithWhisper, loadWhisper };
