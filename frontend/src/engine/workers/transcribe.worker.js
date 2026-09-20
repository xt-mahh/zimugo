// 转写 Worker：独立 ort session，真并行（Phase 0 验证的架构）
import { pipeline, env } from '@huggingface/transformers';
import { makeCustomCache } from '../model-cache.js';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';
// 根治多 Worker 重复下载：官方 customCache 接口，加载器内部读写 Cache API
env.useCustomCache = true;
env.customCache = await makeCustomCache();

let transcriber = null;
let loadedKey = '';

self.onmessage = async (e) => {
  const { type, modelId, device, jobId, pcm, ss, se } = e.data;
  try {
    if (type === 'init') {
      const key = `${modelId}|${device}`;
      if (!transcriber || loadedKey !== key) {
        // dtype 铁律（Phase 0 实测）：WebGPU=fp16+q4，WASM=q8
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
