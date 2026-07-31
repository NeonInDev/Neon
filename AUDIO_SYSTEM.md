Neon Audio System - Overview

This document describes the new STT/TTS system implemented in src/*.js

Files added/modified

- src/stt.js - robust STT module (Whisper local, Groq, DeepSeek, OpenAI)
- src/tts.js - expanded TTS with voice selection, speed, caching and FFmpeg optimization
- src/voice-stt-tts.js - end-to-end integration helper (Discord PCM -> STT -> TTS -> play)
- src/api_publica.js (modified) - new public endpoints for STT/TTS and voice-id
- src/voz.js (modified) - now uses stt and tts modules when handling voice

Configuration (.env)

Add the following environment variables to control behavior (see .env.example):

- WHISPER_MODEL - default Xenova/whisper-small
- WHISPER_LANGUAGE - default pt
- TTS_VOICE_DEFAULT - default pt-BR-FranciscaNeural
- TTS_VOICE_ULTRON - default pt-BR-AntonioNeural
- STT_TIMEOUT_MS - default 30000
- TTS_CACHE_SIZE - default 20

API Endpoints

POST /api/stt
- body: { file: "<base64 WAV>", language?: "pt|en|es|fr" }
- return: { texto, provider }

POST /api/tts
- body: { texto, voz?, velocidade? }
- return: audio/mpeg (mp3 bytes)

POST /api/voice-id/register
- body: { rotulo, file: "<base64 WAV>" }
- return: { ok, rotulo }

POST /api/voice-id/identify
- body: { file: "<base64 WAV>" }
- return: { id, score }

Notes

- STT: local Whisper is default; models are cached in memory for performance.
- TTS: EdgeTTS (edge-tts-universal) used first; fallback to SAPI when needed.
- All audio conversion uses ffmpeg (ffmpeg-static) and respects timeouts.

Testing

- Use /api/stt and /api/tts for HTTP testing (send base64 WAV and receive mp3)
- Voice in Discord will use the new modules automatically.

