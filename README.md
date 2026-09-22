<div align="center">

# localsub

**浏览器里的本地 AI 字幕工具 · 音频永不上传**

[简体中文](#特性) | [English](#english)

基于 Whisper（Transformers.js）+ Silero VAD，在你的浏览器 / 桌面端完成
视频音频 → 中文字幕（SRT）的全流程：解码、VAD 分段、转写、简体化、智能分行。
无服务器、无账号、无上传——断网也能用。

`WebGPU 加速` `完全离线` `Windows 桌面版` `SRT 导出`

</div>

---

## 特性

- **隐私优先**：全部计算在本地（WebGPU / WASM），音频数据零出域，断网可用
- **WebGPU 加速**：RTF ≈ 0.26–0.40（Intel iGPU 实测），10 分钟视频约 3 分钟出字幕
- **智能分行**：词边界折行、短尾合并、复读块过滤（whisper 音乐段「(((((((((」病）
- **内置编辑器**：时间轴校验、逐条修改、疑错高亮、一键导出 UTF-8 无 BOM 的 SRT
- **双渠道**：Web（任意静态托管）+ Windows 桌面版（Wails v2 单 exe，完全离线）

## 快速开始

### Web 版

```bash
git clone https://github.com/xt-mahh/localsub.git
cd localsub/frontend
npm install

# 获取模型（约 400MB，一次性）
# 见下方「获取模型」

npm run dev   # https://localhost:5181（自签证书；WebGPU 需要安全上下文）
```

### 桌面版（Windows x64）

从 [Releases](https://github.com/xt-mahh/localsub/releases) 下载 `localsub.exe`
（约 480MB，内嵌 whisper-small fp16+q4 双精度模型），双击即用，无需安装。

### 获取模型

模型文件不入 git（体积原因），从 HuggingFace 下载后放入 `frontend/public/models/`：

```bash
# whisper-small（主模型，WebGPU/WASM 共用 fp16+q4 量化档）
huggingface-cli download onnx-community/whisper-small \
  --include "config.json" "generation_config.json" "preprocessor_config.json" \
           "tokenizer.json" "tokenizer_config.json" \
           "onnx/encoder_model_fp16.onnx" "onnx/decoder_model_merged_q4.onnx" \
  --local-dir frontend/public/models/onnx-community/whisper-small

# Silero VAD（2MB）
huggingface-cli download onnx-community/silero-vad \
  --include "silero_vad.onnx" \
  --local-dir frontend/public/models/silero-vad
```

## 桌面版构建（可选）

```bash
# Linux 交叉编译 Windows（需 wails CLI + mingw）
bash app/build-desktop.sh
# 产物：app/build/bin/localsub.exe
```

## 架构

SDDL（Spec-Driven Development Loop）驱动开发——spec → 架构 → 派生 → 验证全链路
可审计。四模块划分：

```
engine-core  浏览器内推理编排（后端探测/Worker池/VAD/后处理）
editor       字幕编辑与时间轴校验（简繁转换/词边界折行/短尾合并）
srt-export   SRT 序列化与解析
ui-shell     页面交互与组装
```

完整规格见 [`sddl/`](sddl/)（spec、architecture.yaml、检查报告、收敛判定）。

## 浏览器兼容

| 浏览器 | 后端 |
|---|---|
| Chrome/Edge ≥ 120 | WebGPU（首选）/ WASM 回落 |
| Firefox / Safari | WASM |

## License

MIT

---

<a name="english"></a>
## [English](#特性)

**localsub** — local AI subtitles in your browser. Audio never leaves your machine.

Whisper (Transformers.js) + Silero VAD, fully client-side: decode → VAD segmentation →
transcribe → simplified Chinese → smart line-breaking → edit → export SRT.
No server, no account, no upload — works offline.

- **Privacy first**: all inference runs locally (WebGPU/WASM)
- **WebGPU accelerated**: RTF ≈ 0.26–0.40 measured on Intel iGPU
- **Smart line-breaking**: word-boundary wrapping, tail merging, loop-block filtering
- **Built-in editor**: timeline validation, suspect highlighting, UTF-8 (no BOM) SRT export
- **Dual channel**: Web (any static host) + Windows desktop (Wails v2, single ~480MB exe with embedded models)

See [快速开始](#快速开始) for setup (README is bilingual; source comments are Chinese).
Models are downloaded from HuggingFace — see 「获取模型」 above.

## License

MIT
