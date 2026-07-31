const { db } = require("./db");
const { log } = require("./logger");

const N_FFT = 512;
const N_MELS = 26;
const N_COEFS = 13;
const LIMIAR = 0.85;

function lerWav16k(buf) {
  let off = 12;
  let rate = 16000;
  let channels = 1;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(off + 10);
      rate = buf.readUInt32LE(off + 12);
    }
    if (id === "data") {
      const s = off + 8;
      const n = Math.floor(sz / 2);
      const mono = new Float32Array(Math.floor(n / channels));
      for (let i = 0; i < mono.length; i++) mono[i] = buf.readInt16LE(s + i * channels * 2) / 32768;
      return { samples: mono, rate };
    }
    off += 8 + sz;
  }
  throw new Error("WAV invalido");
}

function melFiltros(nFiltros, fftSize, sampleRate) {
  const hzMin = 0, hzMax = sampleRate / 2;
  const mel = (f) => 2595 * Math.log10(1 + f / 700);
  const melMin = mel(hzMin), melMax = mel(hzMax);
  const pts = [];
  for (let i = 0; i <= nFiltros + 1; i++) {
    pts.push(700 * (Math.pow(10, (melMin + (melMax - melMin) * i / (nFiltros + 1)) / 2595) - 1));
  }
  const bins = pts.map((f) => Math.floor((fftSize + 1) * f / sampleRate));
  const filtros = [];
  for (let m = 1; m <= nFiltros; m++) {
    const linha = new Float32Array(fftSize / 2 + 1);
    for (let k = bins[m - 1]; k < bins[m]; k++) {
      linha[k] = (k - bins[m - 1]) / (bins[m] - bins[m - 1]);
    }
    for (let k = bins[m]; k <= bins[m + 1]; k++) {
      linha[k] = (bins[m + 1] - k) / (bins[m + 1] - bins[m]);
    }
    filtros.push(linha);
  }
  return filtros;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

function mfccDoFrame(frame, filtros) {
  const re = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);
  for (let i = 0; i < frame.length; i++) {
    re[i] = frame[i] * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frame.length - 1)));
  }
  fft(re, im);
  const energies = new Float64Array(N_MELS);
  for (let m = 0; m < N_MELS; m++) {
    let soma = 0;
    const linha = filtros[m];
    for (let k = 0; k < linha.length; k++) {
      if (linha[k] > 0) soma += linha[k] * (re[k] * re[k] + im[k] * im[k]);
    }
    energies[m] = Math.log(Math.max(soma, 1e-10));
  }
  const coefs = new Float64Array(N_COEFS);
  for (let c = 0; c < N_COEFS; c++) {
    let soma = 0;
    for (let m = 0; m < N_MELS; m++) soma += energies[m] * Math.cos(Math.PI * c * (m + 0.5) / N_MELS);
    coefs[c] = soma;
  }
  return coefs;
}

function extrair(wavBuf) {
  const { samples, rate } = lerWav16k(wavBuf);
  const frameLen = Math.floor(rate * 0.025);
  const hop = Math.floor(rate * 0.010);
  const filtros = melFiltros(N_MELS, N_FFT, rate);
  const vetores = [];
  for (let s = 0; s + frameLen <= samples.length; s += hop) {
    const frame = samples.subarray(s, s + frameLen);
    const rms = Math.sqrt(frame.reduce((a, v) => a + v * v, 0) / frame.length);
    if (rms < 0.01) continue;
    vetores.push(mfccDoFrame(frame, filtros));
  }
  if (vetores.length < 10) throw new Error("Audio curto demais ou sem fala");
  const media = new Float64Array(N_COEFS);
  for (const v of vetores) for (let c = 0; c < N_COEFS; c++) media[c] += v[c];
  for (let c = 0; c < N_COEFS; c++) media[c] /= vetores.length;
  const norma = Math.sqrt(media.reduce((a, v) => a + v * v, 0)) || 1;
  for (let c = 0; c < N_COEFS; c++) media[c] /= norma;
  return Array.from(media);
}

function similaridade(a, b) {
  let soma = 0;
  for (let c = 0; c < a.length; c++) soma += a[c] * b[c];
  return soma;
}

function registrar(rotulo, wavBuf) {
  const vetor = extrair(wavBuf);
  if (!db.data.vozes) db.data.vozes = {};
  db.data.vozes[rotulo] = vetor;
  db.write();
  log("INFO", "[VOZ-ID] Padrao de voz registrado", { rotulo });
  return vetor;
}

function identificar(wavBuf) {
  let vetor;
  try {
    vetor = extrair(wavBuf);
  } catch (err) {
    return { id: null, score: 0, erro: err.message };
  }
  if (!db.data.vozes || Object.keys(db.data.vozes).length === 0) {
    return { id: null, score: 0 };
  }
  let melhor = { id: null, score: 0 };
  for (const [rotulo, v] of Object.entries(db.data.vozes)) {
    const s = similaridade(vetor, v);
    if (s > melhor.score) melhor = { id: rotulo, score: s };
  }
  if (melhor.score < LIMIAR) melhor = { id: null, score: melhor.score };
  return melhor;
}

module.exports = { extrair, registrar, identificar };
