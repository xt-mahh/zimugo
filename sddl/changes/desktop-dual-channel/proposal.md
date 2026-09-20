# 变更提案：localsub 部署形态改为 Web + 桌面双渠道

- 提案人：小智（Phase 0 实测后）
- 日期：2026-09-20
- 级别：**L2（增量，兼容性变更）**
- 状态：approved（用户 2026-09-20 会话内确认「同意 Wails 双形态」）

## 意图

交付形态从「GitHub Pages 单一 Web 渠道」扩展为「Web（GitHub Pages）+ 桌面（Wails 封装）」双渠道，扩大触达并解决 WebGPU 安全上下文依赖 HTTPS 的运维负担。

## 理由（Phase 0 实证）

1. WebGPU 要求安全上下文：Web 渠道需 HTTPS + 证书；Wails 的 WebView 本地协议天然满足，桌面版彻底消除该问题。
2. 用户（作者）已有 Wails 同型经验（go-embedded-web-app / three-phase-balance-tool 均 Go+内嵌前端单 binary），无新技术栈成本。
3. 「完全离线优先」定位与本地桌面 app 顺向：模型随包分发或首启下载后永久离线。

## 变更内容（delta）

### MODIFIED: non_goals
- 移除隐含的「仅 Web 形态」限制；新增非目标：**mac/Linux 桌面包（首版仅 Windows，其余平台走 Web 版）**。

### MODIFIED: DP-005（前端技术栈，implementation）
- vanilla JS + Vite（不变）+ **构建产物同时交付 Web 静态包与 Wails 桌面包**。
- Wails v2，前端以 embed 方式嵌入 Go binary；预计体积 ~15MB + 模型文件。

### MODIFIED: B004（loadEngine 行为）
- 新增 then 子句：桌面版（Wails WebView）中模型文件从本地资源目录读取，
  路径解析由宿主注入；Web 版维持浏览器缓存策略。首启离线可用性在桌面版为开箱即得。

### MODIFIED: boundaries
- 新增边界：桌面版无「断网」边界问题（无网络依赖）；Web 版断网边界维持原定义。

### ADDED: 质量约束
- 桌面包体积（不含模型）≤ 30MB；Windows x64 单 exe 免安装或安装包可选。

## 影响面

- 不改任何 interfaces / data_models / 核心 behaviors（转写/编辑/导出逻辑与宿主无关）。
- 派生计划新增：Wails 工程骨架、双渠道构建脚本（build:web / build:desktop）、
  模型分发策略（Web=同源下载+缓存；桌面=包内或首启下载到用户数据目录）。
- 受影响决策点：DP-005（modified，用户已在本会话批准方向）。

## 风险

- WebView2 运行时在 Win10 早期版本需引导安装（Wails 官方引导流程，低风险）。
- 双渠道 CI 维护成本：首版手动构建，不做自动化发布流水线。
