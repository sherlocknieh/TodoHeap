---
title: "主题切换逻辑"
---
# 主题切换逻辑

应用主题只有一个事实来源：界面状态里的 `theme`。它在首屏前被解析成具体的 `light`/`dark`，写到根元素的 `data-theme`；样式体系只认这个属性，系统偏好、顶栏按钮与 Agent 都通过同一条链路作用到它。

## 一、链路总览

| 阶段 | 位置 | 结果 |
| --- | --- | --- |
| 首屏前 | `frontend/index.html` 内联脚本 | 直接读本地 `todoheap:ui:theme`，先给根元素一个 `data-theme`，避免闪色 |
| 启动 | `frontend/src/main.ts` 的 `initTheme()` | 按同一份偏好重新解析并应用，注册系统与界面状态监听 |
| 偏好解析 | `theme.js` 的 `normalizeThemeMode` / `resolveTheme` | 非法值回退 `auto`；`auto` 折算成当前系统亮暗 |
| 应用 | `theme.js` 的 `applyTheme` | 写 `data-theme`、`color-scheme` 与 `meta[name="theme-color"]` |
| 修改 | 顶栏主题菜单 `selectTheme`、顶栏主题按钮 `cycleTheme`（`persistedRef('theme')`）或 Agent `update_app_setting` | 写入 `todoheap:ui:theme`，广播 `todoheap:ui-change` |
| 同步 | `theme.js` 的 `handlePreferenceChange` | 收到同一键的广播后重新应用，已打开界面即时换色 |
| 自动（跟随系统） | `theme.js` 的 `handleSystemChange` | 仅在 `auto` 下响应 `prefers-color-scheme` 变化 |

## 二、偏好与存储

- 键名 `theme`，存于界面状态前缀下，实际本地键为 `todoheap:ui:theme`。
- 合法值只有 `auto`、`light`、`dark`，默认 `auto`。
- 写入统一走 `writeUiState`，因此会经过 JSON 序列化、存储不可用时的静默降级，以及同页广播。
- 顶栏主题菜单用 `persistedRef` 读写，组件卸载不会丢值；Agent 走 `writeUiPreference`，与顶栏命中同一份存储。
- 偏好是设备级的，不进入用户账户设置，也不参与实时同步。

## 三、顶栏按钮的两种入口

按钮支持悬停与点击两条路径，写入的是同一个 `theme` 键：

| 操作 | 行为 |
| --- | --- |
| 悬停 | 展开菜单，可从浅色 / 深色 / 自动中直接选 |
| 点击（精确指针） | `nextThemeMode` 按菜单顺序前进一档：浅色 → 深色 → 自动 → 浅色，菜单保持展开并高亮新档位 |
| 点击（触屏 / 键盘激活） | 展开菜单；触屏没有悬停、键盘需要可达的菜单，故选档仍走菜单 |

`nextThemeMode` 先经 `normalizeThemeMode` 收敛非法值，因此损坏的偏好会落到 `auto` 的下一档 `light`。点击循环与菜单选择都只改偏好，具体亮暗仍由 `resolveTheme` 决定。

## 四、解析

`resolveTheme(mode, prefersDark)` 是唯一的解析规则：

| 偏好 \ 系统 | 浅色 | 深色 |
| --- | --- | --- |
| `auto` | `light` | `dark` |
| `light` | `light` | `light` |
| `dark` | `dark` | `dark` |

- `normalizeThemeMode` 把缺失、损坏或未知值收敛到 `auto`，避免旧数据或手写存储让界面停在无主题状态。
- 解析结果只有 `light`/`dark` 两种，后续样式不需要再判断 `auto`。

## 五、应用与首屏

`applyTheme` 做三件事：

1. `document.documentElement.dataset.theme = resolved`，供 Tailwind 的 `dark:` 变体与组件选择器命中；
2. `documentElement.style.colorScheme = resolved`，让滚动条、表单控件等浏览器原生部件跟随；
3. 更新 `meta[name="theme-color"]`，深色用 `#1b1b1b`，浅色用 `#f1f3f3`。

`index.html` 的内联脚本在 CSS 与模块加载前执行，直接读 `localStorage` 做同样的一次解析，避免强制深色时先画出浅色底再切换。内联脚本只保留读取与折算，不复制监听逻辑；模块启动后由 `initTheme` 接管全部后续变化。

## 六、持续同步

### 系统变化

`initTheme` 注册 `matchMedia('(prefers-color-scheme: dark)')` 的 `change` 监听。回调只在 `currentMode === 'auto'` 时重新应用；手动模式收到系统变化后不做任何事，因此不会被系统反向覆盖。

### 偏好变化

顶栏主题菜单与 Agent 的写入最终都会触发 `writeUiState` 里的 `UI_STATE_CHANGE_EVENT` 广播。`handlePreferenceChange` 只处理 `detail.key === THEME_KEY` 的事件，更新内存中的 `currentMode` 并立即应用。

这条广播是双向一致的：`persistedRef` 本身也监听同一事件，所以无论从顶栏菜单还是 Agent 发起，另一侧都能同步，不依赖刷新或重新挂载。

## 七、样式接线

### Tailwind 变体

`frontend/src/style.css` 用 `@custom-variant dark` 把 `dark:` 从默认的 `prefers-color-scheme` 改为 `[data-theme='dark']`：

```css
@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));
```

这样全站数百处 `dark:` 工具类不需要改写，唯一需要保证的是根元素的 `data-theme` 始终被解析成具体值。`html` 默认 `color-scheme: light`，`html[data-theme='dark']` 改为 `dark`，与应用结果保持一致。

### 组件内样式

原先直接写 `@media (prefers-color-scheme: dark)` 的组件样式改为 `html[data-theme='dark'] ...`：

- Milkdown 编辑器的正文、标题、代码、引用、表格等颜色；
- 回收站页面的自定义按钮；
- 全局滚动条颜色。

这样手动选择浅色时，系统处于深色也不会把编辑器或滚动条留在深色。

### 第三方样式边界

Milkdown 的 nord 主题自带按系统亮暗切换的规则，不受 `data-theme` 控制。编辑器在自身作用域内对可见差异做覆盖，例如表格隔行底色在 `light`/`dark` 下分别指定；其余规则（表格行边框、`pre`/`code` 背景）要么已被编辑器样式覆盖，要么不影响当前布局。新增第三方主题或升级 nord 时，需要重新检查这组按系统切换的规则是否漏出。

## 八、取舍

| 取舍 | 做法 | 原因与代价 |
| --- | --- | --- |
| 用 JS 解析 `auto`，而不是纯 CSS 媒体查询 | 根元素只保留 `light`/`dark` 一个具体值 | 组件只需一套 `dark:` 变体；代价是首屏需要内联脚本兜底 |
| 用 `data-theme` 而不是切换 class | 属性选择器与 scoped CSS 组合稳定 | 避免与组件自身的 class 逻辑冲突；查询与调试也更直观 |
| 偏好存本地，不进账户 | 沿用界面状态存储 | 换设备不会突然改主题；代价是不同步 |
| 手动选择后忽略系统变化 | 系统监听只在 `auto` 下生效 | 用户显式选择优先，不会被系统事件悄悄改回 |
| 任务图画布跟随主题 | 画布底色直接取全局主题的画布令牌 | 少一个独立开关；代价是画布不能单独切深浅 |

## 九、验证

- `frontend/src/utils/theme.test.js` 覆盖 `auto` 跟随系统、手动模式忽略系统、非法值回退三类解析，以及点击循环 浅色 → 深色 → 自动。
- `cd frontend && npm run test` 与 `npm run build` 必须通过；构建后检查 CSS 中的 `dark:` 选择器是否落在 `[data-theme='dark']` 上。
- 手动检查：
  1. 三种模式逐一切换，页面、浮窗、滚动条与原生控件同时变化；
  2. 连续点击顶栏主题按钮，图标与界面按 浅色 → 深色 → 自动 循环，面板始终展开并高亮当前档位；
  3. 选深色后刷新，首屏不出现浅色闪烁；
  4. `auto` 下用系统或浏览器开发者工具切换 `prefers-color-scheme`，界面实时跟随；
  5. 切到浅色后把系统改为深色，界面保持浅色；
  6. 顶栏菜单选中某档后，再让 Agent 通过 `update_app_setting` 改 `theme`，顶栏图标与界面同步。
