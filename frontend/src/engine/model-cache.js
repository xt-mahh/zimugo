// 模型文件缓存（根治多 Worker 重复下载）：
// transformers.js 本地加载的 cache key 非 http(s) 时不会写入 Cache API（源码 storeCachedResource），
// 且 vite dev 无强缓存头 → 每个 Worker 重新 fetch 250MB。
// 方案：统一预取到 Cache API（key = 规范化 URL），Worker init 时确保已缓存。
const CACHE_NAME = 'localsub-models-v1';

/** 模型目录下需要预取的文件（相对 /models/） */
const MANIFEST = {
  'onnx-community/whisper-small': [
    'config.json', 'generation_config.json', 'preprocessor_config.json',
    'tokenizer.json', 'tokenizer_config.json',
    'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
    'onnx/encoder_model_fp16.onnx', 'onnx/decoder_model_merged_q4.onnx',
  ],
  'Xenova/whisper-base': [
    'config.json', 'generation_config.json', 'preprocessor_config.json',
    'tokenizer.json', 'tokenizer_config.json',
    'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
    'onnx/encoder_model_fp16.onnx', 'onnx/decoder_model_merged_q4.onnx',
  ],
};

function fileUrl(repo, file) {
  return new URL(`/models/${repo}/${file}`, self.location.origin).href;
}

/** 确保 Cache API 里存在该模型全部文件；返回缓存命中的 Cache 实例 */
export async function ensureModelCached(repo, onProgress) {
  const cache = await caches.open(CACHE_NAME);
  const files = MANIFEST[repo] || [];
  let done = 0;
  for (const f of files) {
    const url = fileUrl(repo, f);
    let hit = await cache.match(url);
    if (!hit) {
      const resp = await fetch(url);
      if (resp.ok) { await cache.put(url, resp.clone()); hit = resp; }
      else continue; // 可选精度档缺失不致命（如 base 无 fp16）
    }
    done++;
    if (onProgress) onProgress(done / files.length, f);
  }
  return cache;
}

/**
 * 安装 fetch 拦截（在 Worker 内调用）：transformers.js 请求 /models/... 时
 * 直接响应 Cache API 副本，零网络请求。
 */
export function installCacheInterceptor() {
  const origFetch = self.fetch.bind(self);
  self.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/models/')) {
      const abs = new URL(url, self.location.origin).href;
      try {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(abs);
        if (hit) return hit;
      } catch (e) { /* cache 不可用则回落网络 */ }
    }
    return origFetch(input, init);
  };
}
