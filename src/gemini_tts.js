const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TMP = process.env.TEMP || "C:\\Temp";

// Vozes disponíveis do Gemini TTS (gemini-2.5-flash-preview-tts usa nomes de estrelas)
const VOZES = {
  "achernar": "Achernar",
  "achird": "Achird",
  "algenib": "Algenib",
  "algieba": "Algieba",
  "alnilam": "Alnilam",
  "aoede": "Aoede",
  "autonoe": "Autonoe",
  "callirrhoe": "Callirrhoe",
  "charon": "Charon",
  "despina": "Despina",
  "enceladus": "Enceladus",
  "erinome": "Erinome",
  "fenrir": "Fenrir",
  "gacrux": "Gacrux",
  "iapetus": "Iapetus",
  "kore": "Kore",
  "laomedeia": "Laomedeia",
  "leda": "Leda",
  "orus": "Orus",
  "puck": "Puck",
  "pulcherrima": "Pulcherrima",
  "rasalgethi": "Rasalgethi",
  "sadachbia": "Sadachbia",
  "sadaltager": "Sadaltager",
  "schedar": "Schedar",
  "sulafat": "Sulafat",
  "umbriel": "Umbriel",
  "vindemiatrix": "Vindemiatrix",
  "zephyr": "Zephyr",
  "zubenelgenubi": "Zubenelgenubi",
};

// Voz padrão (feminina, natural, estilo ChatGPT)
const VOZ_DEFAULT = "kore";
const MODELO_TTS = "gemini-2.5-flash-preview-tts";

async function geminiTTS(texto, voz = "auto", idioma = "pt-BR") {
  if (!GEMINI_API_KEY) {
    log("WARN", "[GEMINI TTS] API key não configurada");
    return null;
  }

  if (!texto || texto.trim().length === 0) return null;

  const voiceName = voz === "auto" ? VOZ_DEFAULT : (VOZES[voz.toLowerCase()] || voz);

  // Instruções de fala natural (Gemini TTS é prompt-controllable)
  const speakingStyle = "Fale de forma feminina, doce e natural, com entonação humana calorosa, como a voz do ChatGPT. Ritmo suave e conversacional, pausas leves, tom amigável e acolhedor. Use sotaque brasileiro natural.";

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_TTS}:generateContent`;

    const payload = {
      contents: [{
        parts: [{ text: `${speakingStyle}\n\n${texto}` }]
      }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName
            }
          }
        }
      }
    };

    log("INFO", "[GEMINI TTS] Gerando áudio", { voz: voiceName, texto: texto.slice(0, 50) });

    const resp = await axios.post(url, payload, {
      timeout: 30000,
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY }
    });

    const audioData = resp.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      log("WARN", "[GEMINI TTS] Sem áudio na resposta");
      return null;
    }

    // Decodifica base64
    const audioBuffer = Buffer.from(audioData, "base64");

    // Salva como WAV (Gemini retorna PCM 24kHz 16-bit mono)
    const ts = Date.now();
    const wavPath = path.join(TMP, `gemini_tts_${ts}.wav`);

    // Cria header WAV
    const sampleRate = 24000;
    const channels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + audioBuffer.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write("data", 36);
    header.writeUInt32LE(audioBuffer.length, 40);

    const wavBuffer = Buffer.concat([header, audioBuffer]);
    fs.writeFileSync(wavPath, wavBuffer);

    log("INFO", "[GEMINI TTS] Áudio gerado", { tamanho: wavBuffer.length, arquivo: wavPath });

    return wavPath;
  } catch (err) {
    log("ERROR", "[GEMINI TTS] Erro", { erro: err.message, status: err.response?.status });
    return null;
  }
}

async function geminiSTT(audioPath) {
  if (!GEMINI_API_KEY) {
    log("WARN", "[GEMINI STT] API key não configurada");
    return null;
  }

  if (!fs.existsSync(audioPath)) return null;

  try {
    const audioBuffer = fs.readFileSync(audioPath);
    const audioBase64 = audioBuffer.toString("base64");

    // Detecta formato pelo arquivo
    const ext = path.extname(audioPath).toLowerCase();
    let mimeType = "audio/wav";
    if (ext === ".mp3") mimeType = "audio/mpeg";
    else if (ext === ".ogg") mimeType = "audio/ogg";
    else if (ext === ".webm") mimeType = "audio/webm";
    else if (ext === ".flac") mimeType = "audio/flac";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent`;

    const payload = {
      contents: [{
        parts: [
          { text: "Transcreva exatamente o que está sendo falado neste áudio. Responda apenas com o texto transcrito, sem formatação adicional." },
          {
            inlineData: {
              mimeType: mimeType,
              data: audioBase64
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      }
    };

    log("INFO", "[GEMINI STT] Transcrevendo áudio", { arquivo: path.basename(audioPath), tamanho: audioBuffer.length });

    const resp = await axios.post(url, payload, {
      timeout: 30000,
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY }
    });

    const texto = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!texto) {
      log("WARN", "[GEMINI STT] Sem texto na resposta");
      return null;
    }

    log("INFO", "[GEMINI STT] Transcrição", { texto: texto.slice(0, 80) });
    return texto;
  } catch (err) {
    log("ERROR", "[GEMINI STT] Erro", { erro: err.message, status: err.response?.status });
    return null;
  }
}

function listarVozes() {
  return Object.entries(VOZES).map(([key, val]) => `${key} → ${val}`);
}

function temApiKey() {
  return !!GEMINI_API_KEY;
}

module.exports = { geminiTTS, geminiSTT, listarVozes, temApiKey, VOZES };