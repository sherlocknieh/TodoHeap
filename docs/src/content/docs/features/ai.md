---
title: "AI 能力"
---
# AI 能力

本页说明对话 Agent、技能、MCP、模型接入与上下文面板的当前实现。使用方法见 [AI 智能功能](../user/ai-features.md)。

## AI 侧栏分区栈

AI 入口的左侧栏按「对话 / MCP 服务 / 技能」三段折叠栈排列，交互与 VSCode 视图栈一致：

- 全部折叠时三行标题贴顶显示，下方留白；
- 只有一个分区展开时占满侧栏剩余高度；
- 多个分区展开时，按顺序第一个展开的分区占满剩余高度，其余分区使用统一的 192px 高度并各自滚动；
- 技能区非首位展开时可拖拽上缘分隔条调高，排首位展开时隐藏分隔条；
- 展开与折叠有约 200ms 的高度过渡，相邻分区同步让位；拖动分隔条时关闭过渡以保持跟手；
- 折叠状态保存在本地 `sidebar-sections`，刷新后保持。

关键落点：`components/LeftSidebar.vue` 的 `collapsedSections`、`aiSectionClass`、`aiSectionStyle`、`showSkillsResize`；布局机制见 [侧栏开合与窗口宽度](../dev/logic/layout-sidebar.md)。
