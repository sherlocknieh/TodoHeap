---
title: "日期时间选择器"
---
# 日期时间选择器

自建组件替代浏览器原生 `datetime-local` / `date`，统一任务截止时间与日程开始/结束的选择体验。

## 位置与职责

- `frontend/src/components/DateTimePicker.vue`：面板渲染、定位、键盘与草稿状态；`trigger` slot 允许使用方自定义入口外观。
- `frontend/src/utils/datePicker.js`：纯计算，月历网格、字符串互转、时分限幅、触发器文案。
- 使用方：`TodoListItem.vue` 与 `TodoList.vue` 的截止时间入口（slot 触发器，直接展开面板）、`MindMapWrapper.vue` 节点上的截止胶囊、`TodoDetailEditor.vue`、`ScheduleDetailPanel.vue`（默认字段触发器）。

## 值格式

- 时间模式输出 `YYYY-MM-DDTHH:mm`，日期模式输出 `YYYY-MM-DD`，与 `utils/deadline.js` 的 `toDateTimeLocalValue` 同格式。
- 组件只写回本地字符串，转 ISO 与落库由父组件处理：截止时间在 `confirm` 里 `new Date(value).toISOString()`，清空时写 `null`；任务详情交给 `saveDateField`；日程只写表单草稿，点保存时统一折算。
- 打开时沿用原值的时分；原值为空时默认 23:59。

## 面板行为

- 面板 `Teleport` 到 `body` 并使用 fixed 定位：水平居中对齐触发器，垂直方向默认贴在下方、空间不足翻到上方，两侧夹进视口；先以 `visibility: hidden` 渲染定位，再显示，避免闪跳。
- 月历周一起始、固定 6 行；今天描边、选中实心绿、跨月日期淡显；点击跨月日期把视图切到对应月份；翻月时新月份从下方（或上方）竖直滑入、旧月份反向滑出（180ms，`prefers-reduced-motion` 下关闭）；在日期网格上滚动滚轮翻月（累计约 40px 翻一月并冷却 180ms，鼠标一格的滚动即翻一月，触控板惯性强不会连翻）。
- `quickDates` 开启时，面板顶部提供今天 / 明天 / 一周后三个快捷项，点选只改草稿；关闭时保留标题栏的「今天」跳转。
- 时间区与备选时间共用三列网格：时、分两个加减器正好对齐前两个备选按钮，冒号绝对定位在两者缝隙正中；第三列是重置与确定两个按钮，各占一半。加减按钮与输入框间有分割线。面板内所有控件（备选时间、快捷日期、翻月箭头、今天、清除、加减器分组、重置与确定）统一为 28px 高、6px 圆角、同一描边与悬停样式；加减器分组含边框 28px，内部按钮与输入 26px；重置按钮用刷新图标，点击把时分重置为 23:59；加减按周期循环（23 点加一回到 0 点、59 分加一回到 0 分），键盘上下方向键同样循环。时分输入与显示统一两位（如 09 / 00），输入过程中允许暂时一位，失焦后补齐并限幅。默认输入框触发器右侧日历图标常驻、没有悬停 ×：透明状态的 × 仍会接收点击，点输入框右侧会误清空时间，所以输入框的清除入口留在面板里。
- 清除入口随触发器分家：`triggerClear` 开启时（截止标签/胶囊）清除是胶囊右侧悬停出现的 ×，胶囊靠 `group-hover:pr-6` 撑开右内边距给它让位，不可见时 `pointer-events-none` 不接收点击，点击直接清空 `v-model` 并发出 `confirm` 后收起；此时面板不再渲染「清除」。未开启时（输入框触发器）「清除」在有值时出现在面板里（时间模式在备选时间行右端，日期模式在底部左侧）。两种入口都清空 `v-model` 并发出 `confirm`；「确定」把草稿写回 `v-model` 并发出 `confirm`。
- 键盘：←/→ 前后一天，↑/↓ 前后一周，PgUp/PgDn 翻月，Enter 确定，Esc 关闭；焦点在时分输入框时方向键交给输入框。

## 与任务截止时间入口的配合

- 任务行与快速添加栏没有上级菜单：点日历按钮或截止标签即展开面板，预设与确定在面板内（`quickDates`）；清除按触发器区分——截止标签用 `triggerClear`，× 出在胶囊上，面板内不再有「清除」。
- 两处使用 `model-value` 单向绑定当前值，`confirm` 时一次性写库；值来自 `toDateTimeLocalValue(item.deadline)`，因此每次打开都从最新数据初始化草稿。
- 触发器通过 `trigger` slot 换成原有的日历按钮或截止标签，并保留 `.stop`，避免冒泡到任务行触发选中。

## 验证

- `frontend`: `npx vitest run src/utils/datePicker.test.js`。
- `frontend`: `npx vite build`（`vue-tsc` 当前版本与本机 TypeScript 不兼容，用构建做编译校验）。
