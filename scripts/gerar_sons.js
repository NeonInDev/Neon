// Gera efeitos sonoros .wav sinteticos em data/sons/
const fs = require("fs");
const path = require("path");

const TAXA = 44100;

function wav(amostas) {
  const dados = Buffer.alloc(amostas.length * 2);
  for (let i = 0; i < amostas.length; i++) {
    let v = Math.max(-1, Math.min(1, amostas[i]));
    dados.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const cab = Buffer.alloc(44);
  cab.write("RIFF", 0);
  cab.writeUInt32LE(36 + dados.length, 4);
  cab.write("WAVE", 8);
  cab.write("fmt ", 12);
  cab.writeUInt32LE(16, 16);
  cab.writeUInt16LE(1, 20); // PCM
  cab.writeUInt16LE(1, 22); // mono
  cab.writeUInt32LE(TAXA, 24);
  cab.writeUInt32LE(TAXA * 2, 28);
  cab.writeUInt16LE(2, 32);
  cab.writeUInt16LE(16, 34);
  cab.write("data", 36);
  cab.writeUInt32LE(dados.length, 40);
  return Buffer.concat([cab, dados]);
}

const seg = (t) => Math.round(t * TAXA);

// seno com envelope attack/decay
function tom(freq, dur, vol = 0.5, tipo = "seno") {
  const n = seg(dur);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    let f = typeof freq === "function" ? freq(t) : freq;
    let v;
    if (tipo === "quadrada") v = Math.sin(2 * Math.PI * f * t) > 0 ? 1 : -1;
    else if (tipo === "serra") v = 2 * ((f * t) % 1) - 1;
    else if (tipo === "ruido") v = Math.random() * 2 - 1;
    else v = Math.sin(2 * Math.PI * f * t);
    // envelope: ataque rapido, caida exponencial
    const envl = Math.min(1, t / 0.01) * Math.exp(-t * (2.5 / dur));
    out[i] = v * envl * vol;
  }
  return out;
}

function juntar(...partes) {
  return [].concat(...partes);
}

function silencio(dur) {
  return new Array(seg(dur)).fill(0);
}

const sons = {
  // power-up: sweep subindo com brilho final
  ligar: juntar(
    tom((t) => 120 + 700 * (t / 0.9), 0.9, 0.45),
    tom(660, 0.12, 0.4),
    tom(990, 0.25, 0.45)
  ),
  // online: chirp duplo alegre
  online: juntar(tom(660, 0.14, 0.5), silencio(0.05), tom(990, 0.22, 0.5)),
  // desligar: sweep descendo
  desligar: juntar(tom(880, 0.15, 0.45), tom((t) => 600 - 400 * (t / 0.7), 0.7, 0.45)),
  // notificacao: ping agudo curto
  notificar: juntar(tom(1320, 0.09, 0.4), silencio(0.03), tom(1760, 0.18, 0.35)),
  // erro: buzz grave
  erro: juntar(tom(110, 0.28, 0.5, "quadrada"), silencio(0.05), tom(98, 0.35, 0.5, "quadrada")),
  // mensagem: blip suave
  mensagem: juntar(tom(880, 0.07, 0.35), tom(1174, 0.12, 0.3)),
};

const destino = path.join(__dirname, "..", "data", "sons");
fs.mkdirSync(destino, { recursive: true });
for (const [nome, amostas] of Object.entries(sons)) {
  fs.writeFileSync(path.join(destino, nome + ".wav"), wav(amostas));
  console.log("gerado:", nome + ".wav");
}
