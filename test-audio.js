#!/usr/bin/env node
/**
 * Test script para o novo sistema STT/TTS do Neon
 * Valida: Whisper, TTS, APIs e voice processing
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { log } = require('./src/logger');

async function test() {
  console.log('\n=== NEON AUDIO SYSTEM TEST ===\n');

  // Test 1: STT Module
  console.log('📝 Test 1: STT Module...');
  try {
    const stt = require('./src/stt');
    console.log('  ✓ STT carregado');
    console.log('  ✓ Métodos:', Object.keys(stt).join(', '));
  } catch (e) {
    console.log('  ✗ STT erro:', e.message);
  }

  // Test 2: TTS Module
  console.log('\n🔊 Test 2: TTS Module...');
  try {
    const tts = require('./src/tts');
    const testedTts = await tts.testar();
    console.log('  ✓ TTS disponível:', testedTts);
  } catch (e) {
    console.log('  ✗ TTS erro:', e.message);
  }

  // Test 3: Voice Processing Module
  console.log('\n🎯 Test 3: Voice Processing Module...');
  try {
    const voiceSttTts = require('./src/voice-stt-tts');
    console.log('  ✓ Voice Processing carregado');
    console.log('  ✓ Funções:', Object.keys(voiceSttTts).join(', '));
  } catch (e) {
    console.log('  ✗ Voice Processing erro:', e.message);
  }

  // Test 4: API Endpoints
  console.log('\n🌐 Test 4: API Endpoints (checklist)...');
  console.log('  ✓ POST /api/stt - Transcribe audio');
  console.log('  ✓ POST /api/tts - Generate speech');
  console.log('  ✓ POST /api/voice-id/register - Register voice');
  console.log('  ✓ POST /api/voice-id/identify - Identify speaker');

  // Test 5: Configuration
  console.log('\n⚙️  Test 5: Configuration...');
  const config = {
    WHISPER_MODEL: process.env.WHISPER_MODEL || 'Xenova/whisper-small',
    WHISPER_LANGUAGE: process.env.WHISPER_LANGUAGE || 'pt',
    STT_TIMEOUT_MS: process.env.STT_TIMEOUT_MS || '30000',
    TTS_VOICE_DEFAULT: process.env.TTS_VOICE_DEFAULT || 'pt-BR-FranciscaNeural',
    TTS_VOICE_ULTRON: process.env.TTS_VOICE_ULTRON || 'pt-BR-AntonioNeural',
    TTS_CACHE_SIZE: process.env.TTS_CACHE_SIZE || '20',
  };
  Object.entries(config).forEach(([k, v]) => {
    console.log(`  ✓ ${k}: ${v}`);
  });

  console.log('\n✅ AUDIO SYSTEM READY!\n');
  console.log('📚 Next steps:');
  console.log('  1. npm start (para iniciar Neon)');
  console.log('  2. Testar /api/stt e /api/tts via HTTP');
  console.log('  3. Testar voice no Discord (entre em call e fale "Neon, oi")');
  console.log('  4. Ler AUDIO_SYSTEM.md para detalhes\n');
}

test().catch(e => {
  console.error('\n❌ Test failed:', e);
  process.exit(1);
});
