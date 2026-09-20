// transcribe 主流程（spec B001）：decode → VAD → Worker池 → 简体化 → 分行
import { detectBackend, TranscribePool, MODELS } from './engine.js';
import { detectSpeech } from './vad.js';
import { toSimplified } from '../editor/zhconv.js';
import { splitCueByChars } from '../editor/wrap.js';

export const NO_AUDIO_TRACK = 'NO_AUDIO_TRACK';
export const TRANSCRIBE_ABORTED = 'TRANSCRIBE_ABORTED';

/** 浏览器内解码媒体文件为 16kHz 单声道 Float32 PCM */
export async function decodeMedia(file) {
  const ab = await file.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(ab);
  } catch (e) {
    ctx.close();
    throw new Error(NO_AUDIO_TRACK);
  }
  ctx.close();
  // 立体声混单声道
  const chs = decoded.numberOfChannels;
  const len = decoded.length;
  const pcm = new Float32Array(len);
  for (let c = 0; c < chs; c++) {
    const d = decoded.getChannelData(c);
    for (let i = 0; i < len; i++) pcm[i] += d[i] / chs;
  }
  return { pcm, durationSec: decoded.duration };
}

/** VAD 能量兜底：若全程无人声判定，返回 false */
function hasSpeech(segs, durationSec) {
  const speechSec = segs.reduce((a, [x, y]) => a + y - x, 0);
  return speechSec > Math.min(1, durationSec * 0.01);
}

/**
 * 主转写流程。options: { backend, modelKey, concurrency, maxCharsPerCue, useVad, onProgress }
 * 返回 TranscribeResult（spec data model）。
 */
export async function transcribe(file, options = {}) {
  const {
    backend: forced,
    modelKey = 'small',
    concurrency = 3,
    maxCharsPerCue = 10,
    useVad = true,
    onProgress = () => {},
  } = options;

  onProgress({ stage: 'decode', frac: 0 });
  const { pcm, durationSec } = await decodeMedia(file);

  let segs = [[0, durationSec]];
  if (useVad) {
    onProgress({ stage: 'vad', frac: 0 });
    segs = await detectSpeech(pcm, (f) => onProgress({ stage: 'vad', frac: f }));
    if (!hasSpeech(segs, durationSec)) throw new Error(NO_AUDIO_TRACK);
  }

  const { backend } = forced ? { backend: forced } : await detectBackend();
  const pool = new TranscribePool({
    modelId: MODELS[modelKey], backend, concurrency,
    onProgress: (m) => onProgress(m),
  });

  let result;
  try {
    result = await pool.run(pcm, segs, durationSec);
  } catch (e) {
    if (/aborted|AbortError/i.test(String(e))) throw new Error(TRANSCRIBE_ABORTED);
    throw e;
  }

  // 简体化 + 分行（DP-002）+ 顺序校验（B001 then）
  result.cues = result.cues
    .map((c) => ({ ...c, text: toSimplified(c.text).trim() }))
    .filter((c) => c.text.length > 0)
    .flatMap((c) => splitCueByChars(c, maxCharsPerCue))
    .sort((a, b) => a.start - b.start);

  onProgress({ stage: 'done', frac: 1 });
  return result;
}
