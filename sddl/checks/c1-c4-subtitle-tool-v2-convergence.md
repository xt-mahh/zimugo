# SDDL Verify 收敛判定 v2（subtitle-tool v0.2.0 + architecture v1.1.0）· 2026-09-22

> 触发：SDDL 框架升级 v2.1.1（回写通道：顺序传播 + 归因优先），架构按新版从冻结 spec
> 正向重生成后，对存量代码重跑全套 verify。审核立场：对抗式（假设一定不一致，找证据）。
> 审核方式：LLM 逐文件完整阅读（spec / architecture / 全部 src 479+367 行 / tests 160 行 / docs），
> 零信任标签映射；机械证据仅由项目收集器提供。

## 确定性证据（deterministic_evidence，可重跑）

收集器：`sddl/checks/collect_evidence.cjs`（C1-C4）+ `sddl/checks/collect_arch.cjs`（C-arch-def2/3）
+ `check_arch.py` v2.1.1（C-arch-struct/def1）
（本次修复：两收集器及 vite.config.js 中 3 处硬编码旧路径 `/root/workspace/localsub` →
仓库相对定位；零逻辑改动，9/22 项目迁 NAS 后失效）

- **C3**：vitest 20/20 pass（2 文件），0 skipped ✅
- **C2-def 接口**：transcribe/editSubtitle/exportSrt/loadEngine 全部导出 ✅
- **C2-def 错误**：8/8 错误常量全部存在 ✅
- **C4b-def**：docs/current 声明的 8 个 API 全部在代码中 ✅
- **C-arch-struct/def1**（v2.1.1 新增 path 重叠检查）：pass ✅
- **C-arch-def2**：实测 import 图 == 声明 depends_on（engine-core→[editor]；ui-shell→[editor,engine-core,srt-export]）✅
- **C-arch-def3**：4 模块目录全部 ok ✅

## 语义审核（semantic_evidence，对抗式逐项裁决，判定项集 41 = 6×(given+when) + 21 then + 8 err）

### C1-sem / C2-sem（逐 THEN/ERR 对照源码）

- **B001 主流程**：then-1 16kHz 单声道 ✓（transcribe.js decodeMedia 实证）；then-2 ✓；
  **then-3 partial**：进度百分比 ✓（app.js setProgress width%），「预计剩余时间」grep 全码无 ETA ✗；
  then-4 ✓（.sort(start) + VAD 段构造上不重叠 + validateTimeline 有专测）
- **B002 无音轨/无人声**：✓ decode 失败与 VAD 无人声双路径均抛 NO_AUDIO_TRACK，UI 文案实证；
  Worker 环境行为以 E2E 人工验收替代单测（v1 已记录）
- **B003 取消**：then-1 「抛出」→ 实现为 result.aborted 标记返回（无部分结果时 UI 走 catch 显示「转写已取消」）
  ——**记录在案的语义偏差**（v1 已接受，docs/current 措辞「取消且无部分结果」与实现对齐）；
  then-2 ✓ partial 保留 draft + UI 渲染；then-3 「断点继续」入口 = v1 waiver #2（planned，不变）
- **B004 后端与错误**：then-1/2/3 ✓（detectBackend 三级回退、错误三分类、模型缓存离线）；
  then-4 ✓（模型本地同源托管，dist 含 models/）；**then-5 partial**：桌面渠道 WebView 本地协议架构上
  满足安全上下文与离线，但「modelId 指向本地路径」未实现（loadEngine 返回 modelId: null），
  桌面版 WebView2 实测未完成（exe 待用户笔记本验证）
- **B005 编辑**：✓ 5 单测全部真实断言（CUE_NOT_FOUND / start≥end / 相邻重叠 / 合法微调 / status→edited），
  结构反推通过，源码逻辑逐行核对无偏差
- **B006 SRT**：✓ 4 单测（格式逐字符断言 / cueCount / EMPTY_CUES / 无 BOM）+ parseSrt roundtrip

**c1_sem = 39/41 = 0.951 ≥ 0.95** ✅（2 partial：B001-then3 ETA、B004-then5 桌面 modelId；
另有 2 项 v1 记录在案偏差：B003-then1 标记语义、B003-then3 断点入口）

**c2_sem = 41/41 = 1.0** ✅（data_models 为结构约定非导出符号——v1 waiver #1 沿用，单测锁定结构）

### C4a / C4b-sem（文档真实性）

docs/current/capabilities.md 逐条对照源码：4 接口位置/错误契约/dtype 铁律/postprocess/分行规则
全部与实现一致，无超前宣称 ✅ **c4a = 1.0**

### C-arch-sem（职责内聚，v2.1.1 五项 checklist）

1. behaviors ↔ responsibilities：engine-core(B001-B004)/editor(B005+分行)/srt-export(B006)/
   ui-shell(串接+取消+选项) 语义范围吻合 ✅
2. 职责无冲突：「简体化/分行」engine-core 编排 vs editor 实现 —— DP-102 显式登记的编译期耦合，
   非漂移 ✅（带注记）
3. data_flows 方向 == depends_on：3 条流全部一致 ✅
4. cross_component 两端显式依赖：B001 链 ui→engine→editor 声明齐全 ✅
5. path == directory_layout：v1.1.0 已对齐（ui-shell → frontend/src/ui）✅

**c_arch_sem = 1.0（5/5 cohesive）** ✅

## must 级缺口路由（不静默）

| 缺口 | 级别 | 建议路由 |
|------|------|----------|
| ~~B001-then3 进度缺「预计剩余时间」~~ | must（B001） | **已修（2026-09-22）**：app.js onProgress 按 elapsed/frac 估算 ETA（frac≥25% 启用），拼入进度消息；vitest 20/20 + vite build 通过；docs/current 已同步。缺口关闭 |
| B004-then5 modelId 未指向本地路径 + 桌面 E2E 未做 | must（B004） | 待桌面版 WebView2 实测后一并处理（可能与 Wails 宿主注入实现联动） |

## 判定

- 硬条件：C1-def ✅ / C2-def ✅ / C3 ✅ / C4b-def ✅ / C-arch-def1/2/3 ✅
- 软条件：c1_sem 0.951 / c2_sem 1.0 / c4a 1.0 / c_arch_sem 1.0 —— 全部达标
- **CONVERGED（带风险清单）** ✅
- 遗留：2 项 must 级 partial 走路由（上表）；2 项 v1 记录在案偏差沿用（planned/设计选择）
