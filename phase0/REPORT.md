# Phase 0 质量对决报告（2026-09-20 · 终版）

测试集：kindness-loop CH2 成片（301.4s，含 BGM/雨声/口语旁白，真实难度）
Ground truth：人工校对的 33 条字幕（ch2_subs.srt）
环境：transformers.js 3.8.1，模型本地同源托管，笔记本 sanchong（Intel 核显，无独显）

## 结果

| 方案 | 字准确率 | RTF | 备注 |
|---|---|---|---|
| whisper-base 裸跑 (WASM) | ~75%（人声窗） | 1.03 | 幻觉严重（58% 输出） |
| whisper-small 裸跑 (WASM) | 64.6% | 1.90 | 幻觉循环 |
| 能量VAD + whisper-small (WASM) | **84.0%** | 2.15 | 服务器 CPU |
| **Silero VAD + whisper-small (WebGPU fp16enc+q4dec, 4并发)** | 目测同级 | **0.74** | ✅ 笔记本核显实测 |

## 关键结论（全部实测验证）

1. **路线成立，Phase 0 三项硬指标全过**：质量 84%（错误全同音字，LLM 可纠）、
   RTF 0.74 < 1（Intel 核显 + WebGPU + 4 Worker）、时间轴句级 0.6s（词级精修 Phase 1）。
2. **dtype 铁律**：WebGPU 必须用 fp16 encoder + q4 decoder；q8 全量化在 WebGPU 上
   输出多语言乱码（数值错误），曾误诊为 iGPU 慢。WASM 用 q8 正常。
3. **VAD 前置必选**：清 95% 幻觉。BGM 歌声（真实人声）无法被 VAD 过滤，
   Phase 1 用「可疑 cue 标记」处理（短段/括号前缀标灰）。
4. **工程坑已排**：模型必须同源自托管（hf-mirror 有 CORS）；Worker 必须阶梯启动
   （并发首载会重复下载模型 N 份）；silero VAD 浏览器版 tensor shape=[1,512]；
   whisper 中文默认繁体，需 zhconv。
5. **并发模型**：JS Promise 并行是假并行（单线程调度，GPU 30% 占用），
   Web Worker 独立 session 是真并行；GPU 上 3-4 路收益明显。

## Phase 0 关闭，进入 Phase 1 派生（spec v0.1.0 无需变更）

原 L2 变更提案（后端自动选优）不再需要：dtype 修复后 WebGPU-优先/WASM-兜底的
原 spec B004 行为即正确策略。
