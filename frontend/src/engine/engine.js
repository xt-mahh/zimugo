// loadEngine（spec B004）：后端探测 + dtype 策略 + 阶梯 Worker 池
// Phase 0 实测铁律：
//  - WebGPU 必须 fp16 encoder + q4 decoder（q8 全量化在 WebGPU 上输出乱码）
//  - WASM 用 q8（CPU 上快且稳）
//  - Worker 阶梯启动，避免并发首载重复下载模型

export const DTYPES = {
  webgpu: { encoder_model: 'fp16', decoder_model_merged: 'q4' },
  wasm: 'q8',
};

export const MODELS = {
  base: 'Xenova/whisper-base',
  small: 'onnx-community/whisper-small',
};

/** 探测可用后端。Wails WebView（wails:// 协议）与 https/localhost 均为安全上下文。 */
export async function detectBackend() {
  if (!('gpu' in navigator)) return { backend: 'wasm', reason: 'no navigator.gpu' };
  try {
    const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (a) return { backend: 'webgpu', adapter: a.info?.description || a.info?.vendor || 'ok' };
    const b = await navigator.gpu.requestAdapter();
    if (b) return { backend: 'webgpu', adapter: b.info?.description || b.info?.vendor || 'fallback' };
    return { backend: 'wasm', reason: 'adapter null' };
  } catch (e) {
    return { backend: 'wasm', reason: String(e) };
  }
}

/**
 * 启动转写 Worker 池（阶梯式：W0 先加载写缓存，ready 后其余从缓存加载）。
 * 返回 { done, terminate }：done 在全部任务完成时 resolve TranscribeResult。
 */
export class TranscribePool {
  constructor({ modelId, backend, concurrency, onProgress }) {
    this.modelId = modelId;
    this.backend = backend;
    this.concurrency = concurrency;
    this.onProgress = onProgress || (() => {});
    this.workers = [];
    this.nextJob = 0;
    this.results = [];
    this.aborted = false;
  }

  _attach(w, wi, resolve, reject) {
    w.onerror = (e) => reject(new Error(`Worker${wi}: ${e.message || 'error'}`));
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') {
        this._dispatch(w, resolve);
      } else if (m.type === 'result') {
        this.results[m.jobId] = m.chunks;
        this._doneCount = (this._doneCount || 0) + 1;
        this.onProgress({
          stage: 'transcribe',
          frac: 0.2 + 0.8 * (this._doneCount / Math.max(this.jobs.length, 1)),
          msg: `转写中 ${this._doneCount}/${this.jobs.length} 段`,
        });
        this._dispatch(w, resolve);
      } else if (m.type === 'progress') {
        this.onProgress(m);
      } else if (m.type === 'error') {
        reject(new Error(m.message));
      }
    };
  }

  _dispatch(w, resolve) {
    if (this.aborted) { w.terminate(); return; }
    const i = this.nextJob++;
    if (i >= this.jobs.length) { w.terminate(); this._maybeDone(resolve); return; }
    const job = this.jobs[i];
    const seg = this.pcm.subarray(Math.floor(job.ss * 16000), Math.floor(job.se * 16000));
    // 复制一份（transferable 需要独立 buffer，不能转移主 pcm）
    const copy = new Float32Array(seg);
    w.postMessage({ type: 'job', jobId: i, pcm: copy, ss: job.ss, se: job.se }, [copy.buffer]);
  }

  _maybeDone(resolve) {
    if (this._done) return;
    if (this.workers.every((w) => w.terminated)) { this._done = true; resolve(); }
  }

  _newWorker(resolve, reject) {
    // public/workers/ 静态文件：不经 vite 打包，与 phase0 加载方式完全一致
    // （vite 预打包会产生第二个 ort 实例导致 webgpuInit 错误）
    const w = new Worker('/workers/transcribe.worker.js', { type: 'module' });
    const rec = { worker: w, terminated: false };
    const origTerm = w.terminate.bind(w);
    w.terminate = () => { rec.terminated = true; origTerm(); };
    this.workers.push(rec);
    this._attach(w, this.workers.length, resolve, reject);
    return w;
  }

  async run(pcm, segs, durationSec) {
    const { modelId, backend, concurrency } = this;
    this.pcm = pcm;
    this.jobs = segs.filter(([ss, se]) => (se - ss) * 16000 >= 8000);
    this.results = new Array(this.jobs.length);
    this.workers = [];
    this._done = false;
    const NW = Math.min(concurrency, this.jobs.length);
    const t0 = performance.now();

    const allDone = new Promise((resolve, reject) => {
      // 阶梯启动（phase0 已验证）：W0 先加载（大文件一次网络→HTTP 磁盘缓存），
      // ready 后再启 W1..N（命中缓存）。customCache/预取方案实测引入挂起，已回滚。
      (async () => {
        const w0 = this._newWorker(resolve, reject);
        const firstReady = new Promise((res, rej) => {
          w0.addEventListener('message', function once(e) {
            if (e.data.type === 'ready') { w0.removeEventListener('message', once); res(); }
            if (e.data.type === 'error') { w0.removeEventListener('message', once); rej(new Error(e.data.message)); }
          });
        });
        this.onProgress({ stage: 'model', frac: 0.2, msg: `Worker 1/${NW} 加载模型（${backend}）…` });
        w0.postMessage({ type: 'init', modelId, device: backend });

        await firstReady;
        this.onProgress({ stage: 'transcribe', frac: 0.22, msg: '开始转写…' });
        for (let k = 1; k < NW; k++) {
          if (this.aborted) break;
          this.onProgress({ stage: 'model', frac: 0.22, msg: `Worker ${k + 1}/${NW} 从缓存加载…` });
          const wk = this._newWorker(resolve, reject);
          wk.postMessage({ type: 'init', modelId, device: backend });
        }
      })();
    });

    await allDone;
    const elapsedMs = performance.now() - t0;
    const chunks = this.results.flat().sort((a, b) => a.timestamp[0] - b.timestamp[0]);
    return {
      cues: chunks.map((c, i) => ({
        id: `cue${i + 1}`, start: c.timestamp[0], end: c.timestamp[1], text: c.text, status: 'draft',
      })),
      engine: modelId,
      backend: this.backend,
      elapsedMs,
      audioDurationSec: durationSec,
    };
  }

  abort() { this.aborted = true; this.workers.forEach((w) => w.worker.terminate()); }
}
