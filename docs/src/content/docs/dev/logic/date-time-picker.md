---
title: "日期时间选择器"
---
# 日期时间选择器

自建组件替代浏览器原生 `datetime-local` / `date`，统一任务截止时间与日程开始/结束的选择体验。

## 位置与职责

- `frontend/src/components/DateTimePicker.vue`：面板渲染、定位、键盘与草稿状态；`trigger` slot 允许使用方自定义入口外观。
- `frontend/src/utils/datePicker.js`：纯计算，月历网格、字符串互转、时分限幅、触发器文案。
- 使用方：`TodoListItem.vue` 与 `TodoList.vue` 的截止时间入口（slot 触发器，直接展开面板）、`TodoDetailEditor.vue`、`ScheduleDetailPanel.vue`（默认字段触发器）。

## 值格式

- 时间模式输出 `YYYY-MM-DDTHH:mm`，日期模式输出 `YYYY-MM-DD`，与 `utils/deadline.js` 的 `toDateTimeLocalValue` 同格式。
- 组件只写回本地字符串，转 ISO 与落库由父组件处理：截止时间在 `confirm` 里 `new Date(value).toISOString()`，清空时写 `null`；任务详情交给 `saveDateField`；日程只写表单草稿，点保存时统一折算。
- 打开时沿用原值的时分；原值为空时默认 23:59。

## 面板行为

- 面板 `Teleport` 到 `body` 并使用 fixed 定位：水平居中对齐触发器，垂直方向默认贴在下方、空间不足翻到上方，两侧夹进视口；先以 `visibility: hidden` 渲染定位，再显示，避免闪跳。
- 月历周一起始、固定 6 行；今天描边、选中实心绿、跨月日期淡显；点击跨月日期把视图切到对应月份；在日期网格上滚动滚轮翻月（累计约 40px 翻一月并冷却 180ms，鼠标一格的滚动即翻一月，触控板惯性强不会连翻）。
- `quickDates` 开启时，面板顶部提供今天 / 明天 / 一周后三个快捷项，点选只改草稿；关闭时保留标题栏的「今天」跳转。
- 时间区：备选时间（09:00 / 12:00 / 18:00）在上，时钟图标与时分加减器在下；加减按周期循环（23 点加一回到 0 点、59 分加一回到 0 分），键盘上下方向键同样循环。「清除」与「确定」跟加减器同一行，日期模式单独一行。
- 底部「清除」在有值时出现，「确定」把草稿写回 `v-model` 并发出 `confirm`。
- 键盘：←/→ 前后一天，↑/↓ 前后一周，PgUp/PgDn 翻月，Enter 确定，Esc 关闭；焦点在时分输入框时方向键交给输入框。

## 与任务截止时间入口的配合

- 任务行与快速添加栏没有上级菜单：点日历按钮或截止标签即展开面板，预设与清除都在面板内（`quickDates`、`clearable`）。
- 两处使用 `model-value` 单向绑定当前值，`confirm` 时一次性写库；值来自 `toDateTimeLocalValue(item.deadline)`，因此每次打开都从最新数据初始化草稿。
- 触发器通过 `trigger` slot 换成原有的日历按钮或截止标签，并保留 `.stop`，避免冒泡到任务行触发选中。

## 验证

- `frontend`: `npx vitest run src/utils/datePicker.test.js`。
- `frontend`: `npx vite build`（`vue-tsc` 当前版本与本机 TypeScript 不兼容，用构建做编译校验）。
