---
title: "日期时间选择器"
---
# 日期时间选择器

自建组件替代浏览器原生 `datetime-local` / `date`，统一任务截止时间与日程开始/结束的选择体验。

## 位置与职责

- `frontend/src/components/DateTimePicker.vue`：面板渲染、定位、键盘与草稿状态。
- `frontend/src/utils/datePicker.js`：纯计算，月历网格、字符串互转、时分限幅、触发器文案。
- 使用方：`TodoListItem.vue` 与 `TodoList.vue` 的截止时间下拉（`dense` 形态内嵌）、`TodoDetailEditor.vue`、`ScheduleDetailPanel.vue`。

## 值格式

- 时间模式输出 `YYYY-MM-DDTHH:mm`，日期模式输出 `YYYY-MM-DD`，与 `utils/deadline.js` 的 `toDateTimeLocalValue` 同格式。
- 组件只负责写回本地字符串，转 ISO 与落库由父组件处理：截止时间在 `confirm` 里 `new Date(value).toISOString()`；任务详情交给 `saveDateField`；日程只写表单草稿，点保存时统一折算。
- 打开时沿用原值的时分；原值为空时默认 23:59。

## 面板行为

- 面板 `Teleport` 到 `body` 并使用 fixed 定位：默认贴在触发器下方，空间不足翻到上方，水平方向夹进视口；先以 `visibility: hidden` 渲染定位，再显示，避免闪跳。
- 月历周一起始、固定 6 行；今天描边、选中实心绿、跨月日期淡显；点击跨月日期把视图切到对应月份。
- 键盘：←/→ 前后一天，↑/↓ 前后一周，PgUp/PgDn 翻月，Enter 确定，Esc 关闭；焦点在时分输入框时方向键交给输入框。
- 快捷时间按钮 09:00 / 12:00 / 18:00 / 23:59。

## 与下拉菜单的配合

- 两处截止时间下拉使用 `dense` 触发器，并传 `clearable=false`：清除仍由下拉里的「清除截止时间」负责，避免选择器清空值与下拉的清除逻辑重复。
- 选择器面板在 Teleport 之外，下拉的外部点击判断必须把 `.date-picker-panel` 当作内部，否则点面板时会先卸载下拉。
- 触发器点击加 `.stop`，避免冒泡到任务行触发选中。

## 验证

- `frontend`: `npx vitest run src/utils/datePicker.test.js`。
- `frontend`: `npx vite build`（`vue-tsc` 当前版本与本机 TypeScript 不兼容，用构建做编译校验）。
