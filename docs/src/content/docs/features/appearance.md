---
title: "外观与主题"
---
# 外观与主题

本页说明应用主题的当前实现与边界。操作入口见[常见问题](../user/faq.md)的主题相关条目，实现链路见[主题切换逻辑](../dev/logic/theme-switching.md)。

## 三种模式

- 「设置」→「外观」→「主题」提供三个选项：跟随系统（默认）、浅色、深色。
- 跟随系统按操作系统的 `prefers-color-scheme` 实时解析，系统亮暗变化时应用立即跟着切换，无需刷新。
- 手动选择浅色或深色后固定使用所选主题，系统偏好不再影响界面。
- 偏好按设备保存在本地 `todoheap:ui:theme`，刷新、关闭标签页或重开应用后保持；不写入账户，也不跨设备同步。
- 切换即时生效：根元素 `data-theme`、浏览器原生控件配色（`color-scheme`）与地址栏/状态栏使用的 `meta[name="theme-color"]` 同时更新。
- 主题作用于应用内所有页面与浮窗；登录、设置、任务图等视图没有单独的主题开关。

## 设置入口与 Agent

- 设置页的「外观」标签是三模式唯一的图形入口，使用单选按钮组呈现当前选择（`THEME_OPTIONS`）。
- `theme` 同时注册在界面偏好注册表中，因此 Agent 能通过 `list_app_settings` 读到当前值与可选值，并通过 `update_app_setting` 写入 `auto`、`light` 或 `dark`。
- 设置页与 Agent 写的是同一个键，改动会同步到已打开的其他界面组件，不需要刷新。

## 边界

- 任务图画布的浅色/深色底色是独立偏好（`mindmap-dark-canvas`），首次按系统主题取值，之后按画布右下角按钮的手动选择保存；它不随应用主题的手动选择改变。
- 任务图画布的底纹同样是独立偏好：点阵（`mindmap-dot-grid`，默认开启）与坐标网格（`mindmap-coordinate-grid`，默认关闭）互斥，随画布右下角按钮切换并本地保存。
- 主题只决定配色，不改变布局、字号或组件密度。
- Markdown 编辑器的基础配色由 Milkdown 的 nord 主题提供，其中少量按系统亮暗切换的规则由编辑器自身样式按应用主题覆盖；新增第三方按系统切换的样式时需要在同一处补覆盖。

## 关键落点

| 位置 | 作用 |
| --- | --- |
| `frontend/src/utils/theme.js` | 偏好读取、系统解析、根元素应用与持续监听 |
| `frontend/src/pages/todo/Settings.vue` | 「外观」标签与三选一按钮组 |
| `frontend/src/lib/appSettings.js` | `theme` 界面偏好注册，供设置页与 Agent 共用 |
| `frontend/src/style.css` | `dark:` 变体改为跟随 `data-theme` |
| `frontend/index.html` | 首屏前读取偏好，避免强制深色时闪一帧浅色 |
