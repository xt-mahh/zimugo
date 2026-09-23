// 转写 Worker（phase0 原样架构：静态文件，不经 vite 打包）
// 直接从 node_modules dist 加载 —— 与 phase0 测试页完全一致的加载路径。
// 教训：vite 预打包会产生第二个 ort 实例（ort.webgpu.bundle.min.mjs），
// 与 transformers 内部实例的 wasmPaths 不共享 → webgpuInit 错误。
import { pipeline, env } from '/node_modules/@huggingface/transformers/dist/transformers.min.js';

// 模型源（Pages 双源架构，2026-09-22）：
// - GitHub Pages：模型不进 Pages（onnx 超 git 100M 硬限），走 ModelScope 镜像（国内直连快，
//   CORS 全开已实测），回落 HF 由 ensureModelCached 预取层负责（本 worker 只需设 remoteHost）
// - 本地 dev / 桌面版：同源 /models/（桌面版零外网铁律 spec B004 不变）
const IS_PAGES = self.location.hostname === 'xt-mahh.github.io';
if (IS_PAGES) {
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.remoteHost = 'https://modelscope.cn/models/';
  // ModelScope 分支为 master（HF 为 main）；{model} = onnx-community/whisper-small
  env.remotePathTemplate = '{model}/resolve/master/';
} else {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = '/models/';
}
// ort wasm 同源托管（桌面版零外网铁律）：transformers 默认 wasmPaths 指 CDN jsdelivr，
// 离线/Wails 协议下 fetch 失败 → 被误归类 MODEL_DOWNLOAD_FAILED（2026-09-22 桌面实测）
// ⚠️ transformers 3.x API：env 顶层无 wasm 键（首测 env.wasm=undefined 报 TypeError），在 backends.onnx.wasm 下
const BASE = new URL('..', self.location.href).href; // public/workers/ → public/（base 兼容 Pages 子路径）
env.backends.onnx.wasm.wasmPaths = BASE + 'ort/';

let transcriber = null;
let loadedKey = '';

self.onmessage = async (e) => {
  const { type, modelId, device, jobId, pcm, ss, se } = e.data;
  try {
    if (type === 'init') {
      const key = `${modelId}|${device}`;
      if (!transcriber || loadedKey !== key) {
        // dtype 双后端统一 fp16+q4（2026-09-22 L2 变更 desktop-slim-models）：
        // 旧策略 WASM=q8 / WebGPU=fp16+q4，导致两套模型都得随包（792M）。
        // q4 是 MatMulNBits int4 量化，WASM(CPU) EP 支持；fp16 在 CPU 上内部升 fp32。
        // 铁律保留：q8 严禁用于 WebGPU（phase0 实测乱码）——现在根本不带 q8 文件。
        transcriber = await pipeline('automatic-speech-recognition', modelId, {
          dtype: { encoder_model: 'fp16', decoder_model_merged: 'q4' },
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
