// 转写 Worker（phase0 原样架构：静态文件，不经 vite 打包）
// 直接从 node_modules dist 加载 —— 与 phase0 测试页完全一致的加载路径。
// 教训：vite 预打包会产生第二个 ort 实例（ort.webgpu.bundle.min.mjs），
// 与 transformers 内部实例的 wasmPaths 不共享 → webgpuInit 错误。
import { pipeline, env } from '/node_modules/@huggingface/transformers/dist/transformers.min.js';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';

let transcriber = null;
let loadedKey = '';

self.onmessage = async (e) => {
  const { type, modelId, device, jobId, pcm, ss, se } = e.data;
  try {
    if (type === 'init') {
      const key = `${modelId}|${device}`;
      if (!transcriber || loadedKey !== key) {
        transcriber = await pipeline('automatic-speech-recognition', modelId, {
          dtype: device === 'webgpu'
            ? { encoder_model: 'fp16', decoder_model_merged: 'q4' }
            : 'q8',
          device: device || 'wasm',
        });
        loadedKey = key;
      }
      self.postMessage({ type: 'ready' });
    } else if (type === 'job') {
      const out = await transcriber(pcm, {
        language: 'chinese', task: 'transcribe', return_timestamps: true,
        chunk_length_s: 30, stride_length_s: 5,
      });
      const chunks = (out.chunks || []).map((c) => {
        const ts = c.timestamp;
        return { timestamp: [ss + (ts[0] || 0), ss + (ts[1] ?? se - ss)], text: c.text };
      });
      self.postMessage({ type: 'result', jobId, chunks });
    }
  } catch (err) {
    self.postMessage({ type: 'error', jobId, message: String((err && err.message) || err) });
  }
};
