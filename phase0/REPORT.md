# Phase 0 质量对决报告（2026-09-20）

测试集：kindness-loop CH2 成片（301.4s，含 BGM/雨声/口语旁白，真实难度）
Ground truth：人工校对的 33 条字幕（ch2_subs.srt）
环境：服务器 CPU（WASM q8），transformers.js 3.8.1，模型走 hf-mirror

## 结果

| 方案 | 字准确率 | 幻觉 | 时间轴中位/P90 | RTF |
|---|---|---|---|---|
| whisper-base 裸跑 | ~75%（人声窗） | ❌ 严重（58% 输出为幻觉） | 0.6s / 10.4s | 1.03 |
| whisper-small 裸跑 | 64.6% | ❌ 严重（循环×30） | 2.4s / 10.4s | 1.90 |
| **能量VAD分段 + whisper-small** | **84.0%** | ✅ 基本清除 | **0.67s / 3.5s** | 2.15 |

## 结论（DP-001 依据）

1. **路线成立**：VAD 前置 + whisper-small 达 84% 字准确率，剩余错误几乎全为同音字
   （四次假/家、弟/递、感鹿/赶路、云医/雨衣），LLM 纠错后预计 92%+，对标剪映达标。
2. **VAD 前置是必选项**：幻觉是 whisper 家族通病（静音/BGM 段循环复读），
   能量检测(-38dB/0.8s)已清除 95%+；正式版升级 Silero VAD（transformers.js Node 端
   暂不支持 VAD pipeline，浏览器端需自封装 onnx-runtime-web 或参考 whisper-web）。
3. **时间轴**：中位 0.67s，距 spec 目标 ≤0.3s 需词级时间戳精修（Phase 1）。
4. **速度**：CPU WASM 即 RTF 1-2，WebGPU（4060 级）预期 RTF 0.2-0.4（待笔记本实测确认）。
5. **繁体输出**：whisper 中文默认繁体，zhconv 转简解决（或 prompt 引导简体）。

## 待办

- [ ] 笔记本 WebGPU RTF 实测（http://192.168.1.2:8931/web/index.html）
- [ ] 实测通过 → 进入 Phase 1 派生（spec v0.1.0 已冻结）
