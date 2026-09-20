// 转写 Worker：独立 ort session，真并行（Phase 0 验证的架构，保持极简）
// 缓存策略 = phase0 原样：浏览器 HTTP 缓存（大文件传输一次后 disk cache 命中）
// + 主线程阶梯启动。不用 customCache/拦截器——实测引入挂起风险，收益仅 ~5MB 小文件。
import { env as ONNX_ENV } from 'onnxruntime-web/webgpu';
import { pipeline, env } from '@huggingface/transformers';

// ort wasm 运行时本地托管（GFW 下 jsdelivr CDN 不可达，phase0 教训：
// http.server 曾服务整个 node_modules 所以同源命中，vite 需显式指路径）
ONNX_ENV.wasm.wasmPaths = {
  wasm: new URL('/ort/ort-wasm-simd-threaded.jsep.wasm', self.location.origin).href,
  mjs: new URL('/ort/ort-wasm-simd-threaded.jsep.mjs', self.location.origin).href,
};

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
