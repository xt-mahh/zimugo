// Phase 0 对照实验：VAD 前置 + whisper-base，验证幻觉抑制效果
import { pipeline, env } from '@huggingface/transformers';
import { readFileSync, writeFileSync } from 'fs';

env.remoteHost = 'https://hf-mirror.com';

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

console.log('[1/4] 加载 Silero VAD...');
const vad = await pipeline('voice-activity-detection', 'onnx-community/silero-vad');
console.log('[2/4] 加载 whisper-base...');
const asr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', { dtype: 'q8' });

const audio = readWav('test-media/ch2_16k.wav');
const dur = audio.length / 16000;
console.log(`[3/4] VAD 检测 (音频 ${dur.toFixed(1)}s)...`);
const t0 = Date.now();
const vadOut = await vad(audio);
const speech = vadOut
  .map((s) => [Math.max(0, s.start - 0.3), Math.min(dur, s.end + 0.3)]) // 前后各pad 0.3s
  .filter(([a, b]) => b - a > 0.5);
console.log(`  检测到 ${speech.length} 个语音段, 合计 ${speech.reduce((a, [x, y]) => a + y - x, 0).toFixed(1)}s`);

console.log('[4/4] 逐段转写...');
const allChunks = [];
let elapsed = 0;
for (const [ss, se] of speech) {
  const seg = audio.slice(Math.floor(ss * 16000), Math.floor(se * 16000));
  if (seg.length < 8000) continue;
  const t1 = Date.now();
  const out = await asr(seg, { language: 'chinese', task: 'transcribe', return_timestamps: true });
  elapsed += Date.now() - t1;
  for (const c of out.chunks || []) {
    const ts = c.timestamp;
    allChunks.push({
      timestamp: [ss + (ts[0] || 0), se + 0],  // 段内相对时间→全局时间
      text: c.text,
    });
  }
  process.stdout.write(`\r  ${se.toFixed(0)}/${dur.toFixed(0)}s`);
}
console.log(`\n完成: ${allChunks.length} 段, 转写耗时 ${(elapsed / 1000).toFixed(1)}s, RTF=${(elapsed / 1000 / dur).toFixed(2)}`);
writeFileSync('out_whisper-base_vad.json', JSON.stringify({
  model: 'Xenova/whisper-base + silero-vad',
  text: allChunks.map((c) => c.text).join(''),
  chunks: allChunks,
  elapsedSec: elapsed / 1000,
  audioSec: dur,
  rtf: elapsed / 1000 / dur,
}, null, 2));
console.log('→ out_whisper-base_vad.json');
