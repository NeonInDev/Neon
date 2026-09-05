const fs = require('fs');
const path = require('path');
const { log } = require('./logger');
const { GROQ_API_KEY, OPENROUTER_API_KEY } = require('./config');
const axios = require('axios');

const MODEL_CACHE = new Map();
const DEFAULT_MODEL = process.env.WHISPER_MODEL || 'Xenova/whisper-small';
const DEFAULT_LANG = process.env.WHISPER_LANGUAGE || 'pt';
const DEFAULT_TIMEOUT = parseInt(process.env.STT_TIMEOUT_MS, 10) || 30000;

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
  try {
    log('INFO', '[STT] Carregando modelo Whisper', { modelo: model });
    const { pipeline } = require('@xenova/transformers');
    const p = await pipeline('automatic-speech-recognition', model, { quantized: true });
    MODEL_CACHE.set(model, p);
    log('INFO', '[STT] Modelo Whisper pronto', { modelo: model });
    return p;
  } catch (err) {
    log('WARN', '[STT] Falha carregando Whisper', { erro: err.message });
    return null;
  }
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

async function transcribeWithGroq(wavPath, opts = {}) {
  if (!GROQ_API_KEY) return null;
  try {
    log('INFO', '[STT] Tentando Groq');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeout || DEFAULT_TIMEOUT);
    const blob = new Blob([fs.readFileSync(wavPath)], { type: 'audio/wav' });
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', blob, 'audio.wav');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', opts.language || DEFAULT_LANG);
    form.append('response_format', 'json');
    const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      log('WARN', '[STT] Groq HTTP', { status: resp.status, erro: errText.slice(0, 200) });
      return null;
    }
    const data = await resp.json();
    const texto = data?.text?.trim();
    if (texto) return { text: texto, provider: 'groq' };
    return null;
  } catch (err) {
    log('WARN', '[STT] Groq falhou', { erro: err.message?.slice(0, 200) });
    return null;
  }
}

async function transcribeWithOpenAI(wavPath, opts = {}) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.OPENAI_API;
  if (!OPENAI_KEY) return null;
  try {
    log('INFO', '[STT] Tentando OpenAI');
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(wavPath));
    form.append('model', 'whisper-1');
    if (opts.language) form.append('language', opts.language);
    const resp = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, ...form.getHeaders() },
      timeout: opts.timeout || DEFAULT_TIMEOUT,
    });
    const texto = resp?.data?.text?.trim();
    if (texto) return { text: texto, provider: 'openai' };
    return null;
  } catch (err) {
    log('WARN', '[STT] OpenAI falhou', { erro: err.message?.slice(0, 200) });
    return null;
  }
}

async function transcribeFile(wavPath, opts = {}) {
  const language = opts.language || DEFAULT_LANG;
  const timeout = opts.timeout || DEFAULT_TIMEOUT;
  try {
    // OBS: para MENOR LATÊNCIA, tenta o Groq (whisper-large-v3-turbo) PRIMEIRO —
    // roda na nuvem e é muito mais rápido que o Whisper local na CPU.
    // Se o Groq não responder, cai pro Whisper local (offline) e depois OpenAI.

    // 1) Groq (fast, cloud)
    const groq = await transcribeWithGroq(wavPath, { language, timeout });
    if (groq && groq.text) return { text: groq.text, provider: groq.provider };

    // 2) Whisper local (offline; ~sem latência de rede, mas lento na CPU)
    const local = await transcribeWithWhisper(wavPath, { language, model: opts.model, timeout });
    if (local && local.text) return { text: local.text, provider: local.provider };

    // 3) OpenAI
    const openai = await transcribeWithOpenAI(wavPath, { language, timeout });
    if (openai && openai.text) return { text: openai.text, provider: openai.provider };

    return null;
  } catch (err) {
    log('ERROR', '[STT] Erro na transcricao', { erro: err.message });
    return null;
  }
}

module.exports = { transcribeFile, loadWhisper };
