<div align="center">

# ✨ ZimuGo

### 字幕，走你。本地 AI 字幕工具 · 音频永不上传

[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Windows-0ea5e9?style=flat-square)](#-快速开始)
[![Engine](https://img.shields.io/badge/engine-Whisper%20%2B%20WebGPU-a855f7?style=flat-square)](https://github.com/xenova/transformers.js)
[![Privacy](https://img.shields.io/badge/privacy-音频零出域-10b981?style=flat-square)](#-为什么做这个)

**简体中文** · [English](#english)

</div>

---

## ✦ 这是什么

把一段视频或音频拖进浏览器，几分钟后拿到一份可直接导入剪映的 SRT 字幕——
**全过程发生在你自己的设备里**，没有服务器，没有账号，没有上传，断网也能用。

| 传统云端转写 | ZimuGo |
|---|---|
| 音频上传到别人的服务器 🔒 | 音频从不离开你的设备 ✅ |
| 按时长计费 💰 | 免费无限量 ✅ |
| 断网罢工 📵 | 断网照用 ✅ |
| 排队等转写 ⏳ | WebGPU 加速，RTF ≈ 0.3 ⚡ |

## ✦ 特性

| | |
|:---|:---|
| 🎯 **中文转写** | Whisper-small + 简体化 + 词边界智能分行（≤10 字/条，可调），对标剪映主观准确率 ≥90% |
| ⚡ **WebGPU 加速** | 显卡直接跑量化模型，RTF 0.26–0.40（Intel iGPU 实测）；无 GPU 自动回落 WASM |
| ✂️ **只留人话** | Silero VAD 过滤静音/BGM，复读块（「(((((((((」音乐段）整块丢弃，疑错条目高亮 |
| 📝 **内置编辑器** | 时间轴校验、逐条微调、一键导出 UTF-8 无 BOM 的 SRT，剪映/Premiere 直用 |
| 🖥️ **桌面版** | Wails v2 封装 Windows 单文件 exe，模型内嵌，双击即用，彻底离线 |
| 🔍 **可审计** | SDDL 规格驱动开发——spec → 架构 → 测试 → 收敛判定全链路留痕 |

## ✦ 快速开始

### 🖥️ 桌面版（最简单）

到 [Releases](https://github.com/xt-mahh/zimugo/releases) 下载 `ZimuGo.exe`（约 480MB，内嵌双精度模型），
双击即用。**适合：不想配环境、需要彻底离线。**

### 🌐 Web 版

```bash
git clone https://github.com/xt-mahh/zimugo.git
cd zimugo/frontend && npm install
npm run dev   # → https://localhost:5181
```

> WebGPU 需要安全上下文（https 或 localhost），首次启动浏览器会提示信任自签证书。
> 模型（约 400MB）需从 HuggingFace 下载一次，见 [获取模型](docs/MODELS.md)。

## ✦ 工作原理

```
媒体文件 ──▶ 浏览器解码 16kHz PCM ──▶ Silero VAD 人声分段
                                              │
      SRT 导出 ◀── 内置编辑器 ◀── 分行/简体化/去噪 ◀── Whisper (WebGPU/WASM)
```

所有环节运行在浏览器沙箱内——`<audio>` 解码、ONNX 推理、Worker 池调度，
**网络面板里不会有任何音频数据的影子**，欢迎抓包验证。

## ✦ 为什么做这个

作者是短视频创作者，也常在无外网的工作环境里干活。云端转写「传音频」这件事
对隐私敏感场景（单位素材、私人影像）始终是个疙瘩，而现有本地工具要么装环境
繁琐、要么闭源收费。

于是有了 ZimuGo：**字幕这事，就该在你自己机器上完成。**

## ✦ 技术栈

`Transformers.js 3.8` · `onnxruntime-web (WebGPU/WASM)` · `Silero VAD` ·
`Vanilla JS + Vite` · `Wails v2 (Go)` · `Vitest` · `SDDL 规格驱动`

## ✦ Roadmap

- [ ] LLM 同音字纠错（预期准确率 84% → 92%）
- [ ] 词级时间戳精修（≤0.3s）
- [ ] macOS / Linux 桌面版
- [ ] 移动端（sherpa-onnx）

完整规格与架构决策见 [`sddl/`](sddl/) 目录。

## Contributing

Issue / PR 欢迎——提交前请跑 `npm test`（20/20）。

## License

[MIT](LICENSE) · Whisper / Silero VAD 模型版权归各自项目所有

---

<a name="english"></a>
<div align="center">

## ✨ English

</div>

**ZimuGo** — local AI subtitles in your browser. *Your audio never leaves your machine.*

Drop a video, get SRT subtitles in minutes. All inference (Whisper + Silero VAD)
runs client-side via WebGPU/WASM — no server, no account, no upload, works offline.

- 🎯 Chinese transcription with smart line-breaking (≤10 chars/cue, adjustable)
- ⚡ WebGPU accelerated (RTF ≈ 0.3), WASM fallback
- ✂️ VAD silence filtering, loop-block removal, suspect highlighting
- 📝 Built-in editor with timeline validation → UTF-8 SRT export
- 🖥️ Windows desktop build (Wails v2, fully offline, embedded models)

See [快速开始](#-快速开始) for setup (docs mostly Chinese; PRs translating are welcome). Models from HuggingFace — see 「获取模型」 above.

**License**: [MIT](LICENSE)
