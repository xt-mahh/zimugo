// transcribe 主流程（spec B001）：decode → VAD → Worker池 → 简体化 → 分行
import { detectBackend, TranscribePool, MODELS } from './engine.js';
import { detectSpeech } from './vad.js';
import { toSimplified } from '../editor/zhconv.js';
import { splitCueByChars } from '../editor/wrap.js';

export const NO_AUDIO_TRACK = 'NO_AUDIO_TRACK';
export const TRANSCRIBE_ABORTED = 'TRANSCRIBE_ABORTED';

/**
 * 后处理：剔除解码器复读块与 BGM 歌词噪声
 * - 连续 ≥3 条相同文本（如 (((((((( ×40）→ 整块丢弃（whisper 对音乐段的复读病）
 * - 括号字幕类（(字幕:xxx)/(唱)/(Oh xxx)）默认保留（UI 灰显），dropSubtitles=true 时丢弃
 */
export function postprocess(cues, { dropSubtitleNoise = false } = {}) {
  const out = [];
  let runStart = -1, runText = '', runCount = 0;
  const flushRun = () => {
    if (runCount >= 3 && runText.length <= 12) {
      // 复读块：丢弃（runStart..out.length 区间）
      out.length = runStart;
    }
    runStart = -1; runText = ''; runCount = 0;
  };
  for (const c of cues) {
    const t = c.text.trim();
    const isNoise = /^[(（].*[)）)]?$/.test(t) || /^\(+$/.test(t);
    if (dropSubtitleNoise && isNoise) continue;
    if (t === runText) {
      runCount++;
    } else {
      flushRun();
      runStart = out.length; runText = t; runCount = 1;
    }
    out.push(c);
  }
  flushRun();
  return out.filter((c) => c.text.trim().length > 0);
}

/** 浏览器内解码媒体文件为 16kHz 单声道 Float32 PCM */
export async function decodeMedia(file) {
  const ab = await file.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(ab);
  } catch (e) {
    throw new Error(NO_AUDIO_TRACK);
  }
  // 立体声混单声道（先拷贝数据，再关 ctx——close 后 channel data 可能失效，phase0 教训）
  const chs = decoded.numberOfChannels;
  const len = decoded.length;
  const pcm = new Float32Array(len);
  for (let c = 0; c < chs; c++) {
    const d = decoded.getChannelData(c);
    for (let i = 0; i < len; i++) pcm[i] += d[i] / chs;
  }
  ctx.close();
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
    dropSubtitleNoise = false,
    onProgress = () => {},
    onPoolReady = () => {},
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
  onPoolReady(pool); // UI 拿到 pool 引用用于取消（B003）

  let result;
  try {
    result = await pool.run(pcm, segs, durationSec);
  } catch (e) {
    if (/aborted|AbortError/i.test(String(e))) throw new Error(TRANSCRIBE_ABORTED);
    throw e;
  }
  if (result.partial) {
    // B003：取消 → 保留部分结果（draft），同样走简体化/分行管线后返回
    result.aborted = true;
  }

  // 简体化 + 分行（DP-002）+ 复读块过滤 + 顺序校验（B001 then）
  result.cues = postprocess(
    result.cues
      .map((c) => ({ ...c, text: toSimplified(c.text).trim() }))
      .filter((c) => c.text.length > 0)
      .flatMap((c) => splitCueByChars(c, maxCharsPerCue))
      .sort((a, b) => a.start - b.start),
    { dropSubtitleNoise: options.dropSubtitleNoise === true },
  );

  onProgress({ stage: 'done', frac: 1 });
  return result;
}
