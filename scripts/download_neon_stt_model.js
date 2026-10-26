const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const cacheDir = path.join(root, '.neon-opencode', 'models-cache');
const model = process.env.NEON_STT_MODEL || 'Xenova/whisper-small';

async function main() {
  fs.mkdirSync(cacheDir, { recursive: true });
  const { env, pipeline } = require('@xenova/transformers');
  env.cacheDir = cacheDir;
  env.allowLocalModels = true;
  env.allowRemoteModels = true;

  console.log(`Baixando uma vez o modelo offline ${model}...`);
  console.log('Este passo precisa de internet; os áudios da Neon não são usados nem enviados.');
  await pipeline('automatic-speech-recognition', model, { quantized: true });

  env.allowRemoteModels = false;
  console.log(`Modelo ${model} preparado em ${cacheDir}`);
  console.log('A Neon poderá transcrever localmente, sem conexão, depois deste preparo.');
}

main().catch((err) => {
  console.error(`Não foi possível preparar o modelo: ${err.message}`);
  process.exitCode = 1;
});
