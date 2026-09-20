// Phase 0 质量测试：whisper 中文识别质量（服务器 Node 环境，WASM 后端）
// 用法: node run-test.mjs <modelId>
import { pipeline, env } from '@huggingface/transformers';
import { readFileSync, writeFileSync } from 'fs';

// GFW 环境：huggingface.co DNS 污染，走 hf-mirror
env.remoteHost = 'https://hf-mirror.com';

const modelId = process.argv[2] || 'Xenova/whisper-base';
const WAV = 'test-media/ch2_16k.wav';
const OUT = `out_${modelId.split('/').pop()}.json`;

console.log(`[1/3] 加载模型 ${modelId} (wasm)...`);
const t0 = Date.now();
const transcriber = await pipeline('automatic-speech-recognition', modelId, {
  dtype: 'q8',
  progress_callback: (p) => {
    if (p.status === 'progress' && p.file && p.file.endsWith('.onnx')) {
      process.stdout.write(`\r  下载 ${p.file}: ${(p.progress || 0).toFixed(1)}%`);
    }
  },
});
console.log(`\n  模型加载耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

console.log('[2/3] 读取音频并转写...');
// 直接读 16bit PCM wav
const buf = readFileSync(WAV);
const header = buf.readUInt32LE(16); // fmt chunk size
let dataOffset = 20 + header;
// 简化：找 data chunk
while (dataOffset < buf.length - 8) {
  const cid = buf.toString('ascii', dataOffset, dataOffset + 4);
  const sz = buf.readUInt32LE(dataOffset + 4);
  if (cid === 'data') { dataOffset += 8; break; }
  dataOffset += 8 + sz;
}
const nSamples = (buf.length - dataOffset) / 2;
const pcm = new Int16Array(buf.buffer, buf.byteOffset + dataOffset, nSamples);
const audio = new Float32Array(nSamples);
for (let i = 0; i < nSamples; i++) audio[i] = pcm[i] / 32768;
console.log(`  音频时长 ${(nSamples / 16000).toFixed(1)}s`);

const t1 = Date.now();
const output = await transcriber(audio, {
  language: 'chinese',
  task: 'transcribe',
  return_timestamps: true,
  chunk_length_s: 30,
  stride_length_s: 5,
});
const elapsed = (Date.now() - t1) / 1000;
console.log(`  转写耗时 ${elapsed.toFixed(1)}s, RTF = ${(elapsed / (nSamples / 16000)).toFixed(2)}`);

console.log('[3/3] 保存结果...');
writeFileSync(OUT, JSON.stringify({
  model: modelId,
  text: output.text,
  chunks: output.chunks || [],
  elapsedSec: elapsed,
  audioSec: nSamples / 16000,
  rtf: elapsed / (nSamples / 16000),
}, null, 2));
console.log(`完成 → ${OUT}\n--- 识别文本预览 ---\n${output.text.slice(0, 300)}`);
