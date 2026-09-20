// Silero VAD（spec B001 前置）：onnxruntime-web 直载
// Phase 0 坑：tensor shape 必须 [1, 512]，[512,1] 会触发 Conv Invalid input shape {65}
import * as ort from 'onnxruntime-web';

const SR = 16000, WIN = 512;
const TH_ON = 0.5, TH_OFF = 0.35, PAD = 0.3, MIN_SEG = 0.5, MIN_GAP = 0.2;

let session = null;

export async function loadVad(modelPath = '/models/silero-vad/silero_vad.onnx') {
  if (session) return session;
  session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  return session;
}

/** 检测人声段，返回 [[startSec, endSec], ...]（已 pad、过滤短段、合并近段） */
export async function detectSpeech(pcm, onProgress) {
  const sess = await loadVad();
  let state = new ort.Tensor('float32', new Float32Array(2 * 1 * 128), [2, 1, 128]);
  const sr = new ort.Tensor('int64', BigInt64Array.from([BigInt(SR)]), []);
  let speech = false, segStart = 0, offCount = 0;
  const segs = [];
  const dur = pcm.length / SR;
  const totalWins = Math.floor(pcm.length / WIN);

  for (let w = 0; w < totalWins; w++) {
    const chunk = pcm.subarray(w * WIN, (w + 1) * WIN);
    const input = new ort.Tensor('float32', Float32Array.from(chunk), [1, WIN]);
    const out = await sess.run({ input, state, sr });
    const p = out.output.data[0];
    state = out.stateN;
    const t = (w + 1) * WIN / SR;
    if (!speech && p > TH_ON) { speech = true; segStart = Math.max(0, t - PAD); offCount = 0; }
    else if (speech && p < TH_OFF) {
      if (++offCount * WIN / SR > 0.4) {
        speech = false;
        if (t - segStart > MIN_SEG) segs.push([segStart, Math.min(dur, t + PAD)]);
        offCount = 0;
      }
    } else if (speech && p >= TH_OFF) offCount = 0;
    if (onProgress && w % 200 === 0) { onProgress(w / totalWins); await new Promise((r) => setTimeout(r)); }
  }
  if (speech) segs.push([segStart, dur]);

  const merged = [];
  for (const s of segs) {
    if (merged.length && s[0] - merged[merged.length - 1][1] < MIN_GAP)
      merged[merged.length - 1][1] = s[1];
    else merged.push([...s]);
  }
  return merged;
}
