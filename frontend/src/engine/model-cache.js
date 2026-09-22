// 模型文件缓存（根治多 Worker 重复下载）：
// transformers.js 对非 http(s) 本地路径不写 Cache API（源码 storeCachedResource），
// 且 vite 预打包依赖内的 fetch 引用无法被外层覆盖拦截（HAR 实锤两层尝试均失败）。
// 正解：官方 env.customCache 接口 —— transformers.js 加载器内部直接读写 Cache API。
// 同时按 dtype 只预取一套模型，避免双精度 660MB 浪费。
const CACHE_NAME = 'zimugo-models-v1';

/** 每个 dtype 策略需要的 onnx 文件（相对 onnx/） */
const ONNX_FILES = {
  wasm: ['encoder_model_quantized.onnx', 'decoder_model_merged_quantized.onnx'],
  webgpu: ['encoder_model_fp16.onnx', 'decoder_model_merged_q4.onnx'],
};

const BASE_FILES = [
  'config.json', 'generation_config.json', 'preprocessor_config.json',
  'tokenizer.json', 'tokenizer_config.json',
];

/** 该模型+后端需要的全部文件（相对 /models/<repo>/） */
export function filesFor(repo, backend) {
  const onnx = ONNX_FILES[backend] || ONNX_FILES.wasm;
  return [...BASE_FILES, ...onnx.map((f) => `onnx/${f}`)];
}

function fileUrl(repo, file) {
  return new URL(`/models/${repo}/${file}`, self.location.origin).href;
}

/** transformers.js 官方自定义缓存：match/put 直连 Cache API（Worker 内用） */
export async function makeCustomCache() {
  const cache = await caches.open(CACHE_NAME);
  return {
    match: (key) => cache.match(key),
    put: async (key, resp) => {
      try { await cache.put(key, resp); } catch (e) { /* 存储满等异常不致命 */ }
    },
  };
}

/** 预取当前后端所需的一套模型文件到 Cache API（一次网络，Worker 全命中） */
export async function ensureModelCached(repo, backend, onProgress) {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(CACHE_NAME);
  const files = filesFor(repo, backend);
  let done = 0;
  for (const f of files) {
    const url = fileUrl(repo, f);
    if (!(await cache.match(url))) {
      const resp = await fetch(url);
      if (resp.ok) await cache.put(url, resp);
      else continue;
    }
    done++;
    if (onProgress) onProgress(done / files.length, f);
  }
}
