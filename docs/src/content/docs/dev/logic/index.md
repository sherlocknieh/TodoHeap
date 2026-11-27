---
title: "逻辑文档"
---
# 逻辑文档

本目录按机制记录系统当前的实现逻辑：链路怎么走、有哪些约束、如何验证。它回答「代码为什么这样写」，与[架构与技术栈](../architecture.md)的整体视角互补。

每篇只描述当前实现与约束；行为变化时直接改写对应段落，不保留旧实现与修复过程。需求与功能行为见[功能现状](../../features/index.md)。

| 文档 | 范围 |
| --- | --- |
| [任务创建逻辑](./task-create.md) | 从界面到落库的创建链路、临时 ID 与 `client_key` 幂等、旧库退化 |
| [任务顺序](./task-order.md) | `child_ids` 顺序来源、各界面新建插入位置、重排链路与整数组重写的成本 |
| [侧栏开合与窗口宽度](./layout-sidebar.md) | 宽屏偏好与窄屏抽屉两套状态、resize 只关抽屉 |
| [详情右栏与任务图布局](./layout-detail-panel.md) | 任务图下右栏浮层、宽度共享、视图控件与导图视野如何避让、为什么不用 Teleport |
| [节点文字折行与节点高度](./mindmap-text-wrap.md) | 任务图节点文字的折行规则、像素量宽、编辑态撑高 |
| [任务图选中项的可见性修正](./mindmap-selection-visibility.md) | 选中不居中不定档、出界才最小平移、节点过大才缩小 |
| [任务图编辑时的缩放档位](./mindmap-edit-scale.md) | 编辑时的可读档位、以节点中心为锚点、只放大不缩小 |
| [任务图布局逻辑](./mindmap-layout.md) | 可见图与分层、交叉方向的子树块跨度、PAVA 投影、上下居中与多父/跨层边的取舍 |
| [主题切换逻辑](./theme-switching.md) | 偏好解析与首屏应用、Tailwind `dark:` 变体接线、系统与界面状态的持续同步、组件与第三方样式边界 |
| [任务表树状连线](./task-list-tree-lines.md) | 可见行过滤、末位兄弟判定、缩进/连线/折叠开关的共用几何、跨行间距如何接上 |
| [任务多选](./task-multi-select.md) | Ctrl/⌘ 切换、Shift 连选、选择键与可见行顺序、批量删除与撤销 |
| [回收站按天分组](./trash-day-groups.md) | 子树根的删除日期、可见行过滤、未知时间与折叠 |
| [任务图节点多选](./graph-multi-select.md) | Ctrl/⌘ 与 Shift 选择、可见顺序连选、右键批量菜单与批量删除 |
| [任务图删除后的焦点落点](./graph-delete-focus.md) | 删除后落到下一个兄弟、上一个兄弟或父任务，多父任务按展示父链取 |
| [任务图坐标网格](./mindmap-coordinate-grid.md) | 世界坐标与视口换算、原点在根节点出边按钮、1/2/5 自适应刻度、底纹互斥与配色 |
| [日期时间选择器](./date-time-picker.md) | 自建月历面板、值格式、定位与键盘、截止时间入口的预设与清除 |
| [Markdown 编辑器的空引用块](./milkdown-empty-blockquote.md) | 空引用块删不掉的根因、自定义 keymap 的接管范围 |
| [日程新建与临时 ID](./schedule-optimistic-create.md) | 新建即开右栏、临时 ID 换算、写入排队与失败回滚 |
| [应用地址与路由前缀](./app-url.md) | 静态基路径 `/TodoHeap/app/` 与 hash 视图名两段前缀、工作区父路由与认证回跳约束 |
