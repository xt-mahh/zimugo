# 变更提案：桌面版模型瘦身——双后端统一 fp16+q4，移除 q8/base 随包档

- 提案人：小智
- 日期：2026-09-22
- 级别：**L2（增量，兼容性变更——B004 回落边界行为修订）**
- 状态：approved（用户 2026-09-22 会话内确认「只需要 WebGPU 那套」+ WASM 也可跑该套）

## 意图

桌面版 exe 从 792M 瘦身至约 480M：模型随包从 710M 减至 399M（-310M）。

## 理由

1. 双 dtype 策略（WASM=q8 / WebGPU=fp16+q4）是随包肥大的唯一根因——同一模型须带两套量化档。
2. q4 = MatMulNBits int4 量化，onnxruntime WASM(CPU) EP 支持该算子；fp16 encoder 在 CPU 上
   内部升 fp32（内存 +168M、速度降，但可跑）。q8 档的唯一存在理由是当时 WASM 实测更快，
   桌面版定位是 WebGPU 优先，WASM 仅回落路径——回落可接受降速。
3. whisper-base（73M）在 UI 中仅是备用选项，small 是准确率 must 约束（≥90%）的实际承担者。

## 变更内容（delta）

### MODIFIED: B004 then-1（dtype 策略）
- 旧：WebGPU=fp16+q4 / WASM=q8
- 新：双后端统一 fp16+q4。dtype 铁律中「q8 严禁用于 WebGPU（乱码）」保留——
  现在包内根本不含 q8 文件，从物理上杜绝误配。

### MODIFIED: boundaries「WebGPU 初始化失败」（回落路径）
- 旧：回落 WASM（q8 档）
- 新：回落 WASM（fp16+q4，CPU 内部升 fp32 跑 encoder，速度较 q8 慢、功能等价）。
  回落可用性不删——「无 GPU 机器完全不可用」才是行为回归，实测确认后本条成立。

### MODIFIED: non_goals
- 新增：桌面随包 whisper-base 档（UI 模型选择仅保留 small；Web 版同策略同步）。

### ADDED: 质量约束
- 桌面版 exe 体积目标 ≤ 500M（含模型）。

## 影响面

- 移除文件：whisper-small q8 encoder(88M)/q8 decoder(149M)、whisper-base 全部(73M)。
- worker dtype 分支删除；engine.js DTYPES 常量同步；index.html 模型下拉移除 base 选项。
- docs/current dtype 铁律描述同步。
- 待用户实测确认：① WebGPU 出字幕正常；② 手动切 WASM 后端 fp16+q4 可跑（回落成立证据）。

## 风险

- fp16 encoder 在低端 CPU 上升 fp32 可能触发内存压力（约 +336M RAM）——WASM 本就是回落
  场景，可接受；实测异常则回退本提案（文件可从 HF 重新拉取）。
