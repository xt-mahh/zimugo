// 转写 Worker（phase0 原样架构：静态文件，不经 vite 打包）
// 直接从 public/node_modules dist 加载 —— 与 phase0 测试页完全一致的加载路径。
// 教训：vite 预打包会产生第二个 ort 实例（ort.webgpu.bundle.min.mjs），
// 与 transformers 内部实例的 wasmPaths 不共享 → webgpuInit 错误。
//
// ⚠️ 静态 import 不接受运行时字符串，而部署路径在 Pages 子路径（/zimugo/app/）下不固定
// → 必须用动态 import() + 相对推导（2026-09-23 修复：静态绝对路径 '/node_modules/...'
//    在 Pages 域名根下 404 → "Worker1: error"）
const BASE = new URL('..', self.location.href).href; // public/workers/ → public/（子路径安全）

// 模型源（Pages 双源架构，2026-09-22）：
// - GitHub Pages：模型不进 Pages（onnx 超 git 100M 硬限），走 ModelScope 镜像（国内直连快，
//   CORS 全开已实测），回落 HF 由预取层负责（本 worker 只需设 remoteHost）
// - 本地 dev / 桌面版：同源 /models/（桌面版零外网铁律 spec B004 不变）
let pipeline, env;
const IS_PAGES = self.location.hostname === 'xt-mahh.github.io';

const _log = (m) => { try { console.log('[worker] ' + m); self.postMessage({ type: 'worker-log', message: String(m).slice(0, 200) }); } catch (e) {} };
_log('TLA import 开始, BASE=' + BASE);
const tjs = await import(BASE + 'node_modules/@huggingface/transformers/dist/transformers.min.js');
_log('transformers 导入完成, version=' + (tjs.env && tjs.env.version));
pipeline = tjs.pipeline;
env = tjs.env;

_log('IS_PAGES=' + IS_PAGES);
if (IS_PAGES) {
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.remoteHost = 'https://modelscope.cn/models/';
  // ModelScope 分支为 master（HF 为 main）；{model} = onnx-community/whisper-small
  env.remotePathTemplate = '{model}/resolve/master/';
} else {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = new URL('models/', BASE).href;
}
// ort wasm 同源托管（桌面版零外网铁律）：transformers 默认 wasmPaths 指 CDN jsdelivr，
// 离线/Wails 协议下 fetch 失败 → 被误归类 MODEL_DOWNLOAD_FAILED（2026-09-22 桌面实测）
// ⚠️ transformers 3.x API：env 顶层无 wasm 键（首测 env.wasm=undefined 报 TypeError），在 backends.onnx.wasm 下
_log('wasmPaths 前, onnx keys=' + JSON.stringify(Object.keys(env.backends.onnx || {})));
env.backends.onnx.wasm.wasmPaths = BASE + 'ort/';
_log('wasmPaths 设置完成');
// 握手：worker 求值完成（TLA 期间主线程早期发的 init 会丢失，见 2026-09-23 线上排障）
self.postMessage({ type: 'worker-ready' });

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
        _log('pipeline 开始: ' + modelId + ' / ' + (device || 'wasm'));
        // 下载进度上报（2026-09-23 用户反馈：初次拉 390M 无进度提示体验差）
        // transformers 3.x progress_callback 事件：{status: 'progress'|'done'|'ready', file, progress, loaded, total}
        const fileProg = {}; // fileName → {loaded,total}
        const report = () => {
          const entries = Object.values(fileProg);
          if (!entries.length) return;
          const loaded = entries.reduce((a, f) => a + (f.loaded || 0), 0);
          const total = entries.reduce((a, f) => a + (f.total || 0), 0);
          if (total > 0) {
            self.postMessage({ type: 'progress', stage: 'model', frac: 0.02 + 0.18 * (loaded / total),
              msg: `下载模型 ${Math.round(loaded / 1048576)}/${Math.round(total / 1048576)} MB（${Math.round((loaded / total) * 100)}%）` });
          }
        };
        let lastReport = 0;
        transcriber = await pipeline('automatic-speech-recognition', modelId, {
          dtype: { encoder_model: 'fp16', decoder_model_merged: 'q4' },
          device: device || 'wasm',
          progress_callback: (data) => {
            if (!data || !data.file) return;
            if (data.status === 'progress') {
              fileProg[data.file] = { loaded: data.loaded || 0, total: data.total || 0 };
              const now = Date.now();
              if (now - lastReport > 300) { lastReport = now; report(); } // 节流 300ms
            } else if (data.status === 'done') {
              fileProg[data.file] = { loaded: data.total || fileProg[data.file]?.total || 0, total: data.total || fileProg[data.file]?.total || 0 };
              report();
            }
          },
        });
        loadedKey = key;
        _log('pipeline 完成');
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
