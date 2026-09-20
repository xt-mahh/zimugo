# localsub 已实现能力（status: current）

> 对应 spec v0.2.0。本文档只描述已实现并验证的行为。

## 接口（spec interfaces）

### transcribe(file, options) → TranscribeResult（B001/B002/B003）
- 位置：`frontend/src/engine/transcribe.js`
- 浏览器内解码媒体（16kHz 单声道），Silero VAD 前置（可关），阶梯式 WebGPU/WASM Worker 池转写，
  zhconv 简体化 + ≤N 字分行（短尾合并）+ 复读块过滤
- 错误：`NO_AUDIO_TRACK`（无音轨/无人声）、`TRANSCRIBE_ABORTED`（取消且无部分结果）
- 取消：`abort()` 保留已完成分段，结果带 `aborted: true`（B003）
- dtype 铁律：WebGPU=fp16+q4 / WASM=q8（q8 在 WebGPU 上输出乱码）

### loadEngine(backend?) → EngineInfo（B004）
- 位置：`frontend/src/engine/engine.js`
- WebGPU 优先（high-performance adapter），回落 WASM；非法后端值抛 `BACKEND_UNAVAILABLE`
- Worker 初始化错误归类：`MODEL_DOWNLOAD_FAILED`（fetch/404 类）/ `ENGINE_INIT_FAILED`（backend 初始化类）
- 模型本地同源托管（`/models/`），ort wasm 本地托管（`/workers/` 同目录），零外网依赖

### editSubtitle(cues, cueId, patch) → Cue（B005）
- 位置：`frontend/src/editor/cue.js`
- 文本/时间轴 patch，status → edited；`CUE_NOT_FOUND` / `INVALID_TIME_RANGE`（start≥end 或与相邻重叠）

### exportSrt(cues, opts) → SrtFile（B006）
- 位置：`frontend/src/export/srt.js`
- 标准 SRT（HH:MM:SS,mmm）、UTF-8 无 BOM、空 cues 抛 `EMPTY_CUES`；parseSrt 支持 roundtrip

## 后处理
- `postprocess(cues, {dropSubtitleNoise})`：连续≥3 条相同短文本（whisper 音乐段复读病）整块丢弃；
  括号类 BGM 歌词噪声可选过滤（UI「滤BGM」开关）
- `wrapByWords` / `splitCueByChars`：词边界折行（DP-002），短尾（≤2 字）合并回上一行

## 验证状态
- 单元测试 20/20（vitest）：SRT 格式/BOM/roundtrip、编辑校验、繁简转换（含「著」词级规则）、分行/短尾合并
- E2E 人工验收（2026-09-20，sanchong/Intel iGPU/WebGPU）：CH1 310MB → 170 条真实中文字幕，RTF 0.40；
  CH2 → 53 条，RTF 0.26
