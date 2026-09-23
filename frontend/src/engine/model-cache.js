// 模型文件缓存（根治多 Worker 重复下载）：
// transformers.js 对非 http(s) 本地路径不写 Cache API（源码 storeCachedResource），
// 且 vite 预打包依赖内的 fetch 引用无法被外层覆盖拦截（HAR 实锤两层尝试均失败）。
// 正解：官方 env.customCache 接口 —— transformers.js 加载器内部直接读写 Cache API。
// 同时按 dtype 只预取一套模型，避免双精度 660MB 浪费。
//
// 模型源解析（Pages 双源架构，2026-09-22）：
// - GitHub Pages（xt-mahh.github.io）：模型不进 Pages（两个 onnx 超 git 100M 硬限），
//   主源 ModelScope 镜像（onnx-community/whisper-small 官方同构镜像，CORS 全开，国内直连快），
//   回落源 huggingface.co（单点故障兜底，2026-09-22 用户确认方案）
// - 其他环境（本地 dev / 桌面版）：同源 /models/（桌面版零外网铁律，spec B004）
// transformers.js 对应配置：env.remoteHost + env.remotePathTemplate（worker 侧）
// 本文件保证预取 URL 与 transformers 内部拼接 URL 完全一致（Cache key 一致性）

const CACHE_NAME = 'zimugo-models-v1';

const PAGES_HOST = 'xt-mahh.github.io';
const MS_BASE = 'https://modelscope.cn/models/';
const MS_TEMPLATE = '{model}/resolve/master/';
const HF_BASE = 'https://huggingface.co/';
const HF_TEMPLATE = '{model}/resolve/{revision}/';

/** 是否运行在 GitHub Pages 上（决定模型源） */
export function isPages() {
  return typeof self !== 'undefined' && self.location?.hostname === PAGES_HOST;
}

/** 模型文件基础 URL（含尾斜杠）：Pages→ModelScope，其余→同源 /models/ */
export function modelBase() {
  if (isPages()) return MS_BASE;
  return new URL(import.meta.env.BASE_URL + 'models/', self.location.origin).href;
}

/** 仓库路径模板（transformers env.remotePathTemplate 同规格） */
export function remotePathTemplate() {
  return isPages() ? MS_TEMPLATE : HF_TEMPLATE;
}

/** 每个 dtype 策略需要的 onnx 文件（相对 onnx/） */
const ONNX_FILES = {
  wasm: ['encoder_model_quantized.onnx', 'decoder_model_merged_quantized.onnx'],
  webgpu: ['encoder_model_fp16.onnx', 'decoder_model_merged_q4.onnx'],
};

const BASE_FILES = [
  'config.json', 'generation_config.json', 'preprocessor_config.json',
  'tokenizer.json', 'tokenizer_config.json',
];

/** 该模型+后端需要的全部文件（相对 <base>/<repo>/） */
export function filesFor(repo, backend) {
  const onnx = ONNX_FILES[backend] || ONNX_FILES.wasm;
  return [...BASE_FILES, ...onnx.map((f) => `onnx/${f}`)];
}

function fileUrl(repo, file) {
  // ModelScope 与本地 /models/ 仓库树同构：<repo>/onnx/xxx
  return new URL(`${repo}/${file}`, modelBase()).href;
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

/** 预取当前后端所需的一套模型文件到 Cache API（一次网络，Worker 全命中）
 *  双源容错（2026-09-22 用户确认）：Pages 下 ModelScope 某文件失败 → 回落 huggingface.co 单文件重试 */
export async function ensureModelCached(repo, backend, onProgress) {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(CACHE_NAME);
  const files = filesFor(repo, backend);
  let done = 0;
  for (const f of files) {
    const url = fileUrl(repo, f);
    if (!(await cache.match(url))) {
      let resp = await fetch(url);
      if (!resp.ok && isPages()) {
        // HF 回落：URL 规格差异 = resolve/{revision}，revision 默认 main
        const hfUrl = new URL(`${repo}/resolve/main/${f}`, HF_BASE).href;
        resp = await fetch(hfUrl);
        if (resp.ok) await cache.put(url, resp); // 以主源 URL 为 Cache key 存回
      }
      if (resp.ok && !(await cache.match(url))) await cache.put(url, resp);
      if (!(await cache.match(url))) continue;
    }
    done++;
    if (onProgress) onProgress(done / files.length, f);
  }
}
