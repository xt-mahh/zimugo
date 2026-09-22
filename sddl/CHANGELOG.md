# SDDL CHANGELOG

## 2026-09-22 spec v0.2.1（元数据修订：项目更名 localsub → ZimuGo）
- 变更：项目更名为 ZimuGo（开源发布需要辨识度，用户选定）；spec/arch id 与产品名同步
- 行为/接口/数据模型零变更；20/20 单测回归通过

## 2026-09-20 spec v0.2.0（L2 变更：desktop-dual-channel）
- 变更：交付形态 Web 单渠道 → Web + Wails 桌面双渠道（Windows 首版）
- 修改：DP-005（技术栈+形态）、B004（桌面模型加载路径）、断网边界、新增 packaging 约束、non_goals 排除 mac/Linux 桌面
- 提案：sddl/changes/desktop-dual-channel/proposal.md（用户会话内批准）
- 影响：无 interfaces/data_models 变更；派生计划新增 Wails 骨架与双渠道构建
