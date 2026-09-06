import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const MODEL_BYTES = 8_373_440;
const projectRoot = process.cwd();
const outputRoot = path.join(projectRoot, 'public', 'mediapipe');
const outputWasm = path.join(outputRoot, 'wasm');
const packageRoot = path.dirname(fileURLToPath(import.meta.resolve('@mediapipe/tasks-vision')));
const packageWasm = path.join(packageRoot, 'wasm');

await mkdir(outputWasm, { recursive: true });

for (const fileName of [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]) {
  await copyFile(path.join(packageWasm, fileName), path.join(outputWasm, fileName));
}

const modelPath = path.join(outputRoot, 'gesture_recognizer.task');
const existingModel = await stat(modelPath).catch(() => undefined);

if (existingModel?.size !== MODEL_BYTES) {
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`Unable to download gesture model (${response.status})`);
  const model = new Uint8Array(await response.arrayBuffer());
  if (model.byteLength !== MODEL_BYTES) throw new Error('Downloaded gesture model has an unexpected size');
  await writeFile(modelPath, model);
}

console.log('MediaPipe gesture assets are ready.');
