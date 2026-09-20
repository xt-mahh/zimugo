// localsub Phase0 转写 Worker：独立 ort session，真并行
import { pipeline, env } from '/node_modules/@huggingface/transformers/dist/transformers.min.js';
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/web/models/';

let transcriber = null, loadedModel = '';

self.onmessage = async (e) => {
  const { type, modelId, device, jobId, pcm, ss, se } = e.data;
  try {
    if (type === 'init') {
      if (!transcriber || loadedModel !== modelId) {
        // WebGPU: fp32/fp16 encoder + q4 decoder（官方推荐，q8全量化在WebGPU上会输出乱码）
        // WASM:  q8 全量化（CPU 上快且稳）
        transcriber = await pipeline('automatic-speech-recognition', modelId, {
          dtype: (device === 'webgpu')
            ? { encoder_model: 'fp16', decoder_model_merged: 'q4' }
            : 'q8',
          device: device || 'wasm',
        });
        loadedModel = modelId;
      }
      self.postMessage({ type: 'ready' });
    } else if (type === 'job') {
      const t0 = performance.now();
      const out = await transcriber(pcm, {
        language: 'chinese', task: 'transcribe', return_timestamps: true,
        chunk_length_s: 30, stride_length_s: 5,
      });
      const chunks = (out.chunks || []).map((c) => {
        const ts = c.timestamp;
        return { timestamp: [ss + (ts[0] || 0), ss + (ts[1] ?? se - ss)], text: c.text };
      });
      self.postMessage({ type: 'result', jobId, chunks, ms: performance.now() - t0 });
    }
  } catch (err) {
    self.postMessage({ type: 'error', jobId, message: String(err && err.message || err) });
  }
};
