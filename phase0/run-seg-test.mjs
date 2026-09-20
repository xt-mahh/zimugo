// Phase 0 对照实验2：ffmpeg silencedetect 语音段 + whisper-small 逐段转写
// 用法: node run-vad-ffmpeg.mjs <segments.json> <modelId> <outFile>
import { pipeline, env } from '@huggingface/transformers';
import { readFileSync, writeFileSync } from 'fs';

env.remoteHost = 'https://hf-mirror.com';

const [,, segPath, modelId, outFile] = process.argv;
const speech = JSON.parse(readFileSync(segPath, 'utf-8'));

const readWav = (p) => {
  const buf = readFileSync(p);
  const hsz = buf.readUInt32LE(16);
  let off = 20 + hsz;
  while (off < buf.length - 8) {
    const cid = buf.toString('ascii', off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    if (cid === 'data') { off += 8; break; }
    off += 8 + sz;
  }
  const n = (buf.length - off) / 2;
  const pcm = new Int16Array(buf.buffer, buf.byteOffset + off, n);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = pcm[i] / 32768;
  return f;
};

console.log(`加载 ${modelId}...`);
const asr = await pipeline('automatic-speech-recognition', modelId, { dtype: 'q8' });
const audio = readWav('test-media/ch2_16k.wav');
const dur = audio.length / 16000;
console.log(`音频 ${dur.toFixed(1)}s, ${speech.length} 个语音段`);

const allChunks = [];
let elapsed = 0;
for (const [ss, se] of speech) {
  const seg = audio.slice(Math.floor(ss * 16000), Math.floor(se * 16000));
  if (seg.length < 8000) continue;
  const t1 = Date.now();
  const out = await asr(seg, { language: 'chinese', task: 'transcribe', return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
  elapsed += Date.now() - t1;
  for (const c of out.chunks || []) {
    const ts = c.timestamp;
    allChunks.push({ timestamp: [ss + (ts[0] || 0), ss + (ts[1] ?? se - ss)], text: c.text });
  }
  process.stdout.write(`\r  进度 ${se.toFixed(0)}/${dur.toFixed(0)}s`);
}
console.log(`\n完成: ${allChunks.length} chunks, 转写 ${(elapsed / 1000).toFixed(1)}s, RTF=${(elapsed / 1000 / dur).toFixed(2)}`);
writeFileSync(outFile, JSON.stringify({
  model: modelId + ' + ffmpeg-silencedetect',
  text: allChunks.map((c) => c.text).join(''),
  chunks: allChunks,
  elapsedSec: elapsed / 1000,
  audioSec: dur,
  rtf: elapsed / 1000 / dur,
}, null, 2));
console.log(`→ ${outFile}`);
