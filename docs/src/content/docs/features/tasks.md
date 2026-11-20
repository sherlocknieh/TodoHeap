---
title: "任务与层级"
---
# 任务与层级

本页说明任务本体相关的当前实现：创建、编辑、完成、层级与回收站。使用方法见[任务管理](../user/task-management.md)。

## 已完成按天分组（2026-11-20）

- 需求：任务表的「已完成」区按完成日期分隔，而不是一整串平铺。
- 实现：[TodoList.vue](../../../../frontend/src/pages/todo/TodoList.vue) 的 `completedGroups` 调用 `utils/completedGroups.js` 的 `groupCompletedByDay`。
- 口径：以 `completed_at` 的本地自然日为分组键；标题为「今天 / 昨天 / M月D日」，跨年补「YYYY年」；每天标题后跟当天数量与一条分隔线。
- 顺序：分组按日期倒序，最新完成的一天在最上面；组内任务按完成时间倒序。
- 折叠：日期分隔整行（含分隔线）可点击，收起/展开当天任务；收起时标题与数量仍显示，状态只存在当前会话。
- 单条删除：每条右侧有删除按钮，走软删除进回收站，提示里可撤销；与整区「清除已完成」互不影响。
- 多选：待办区与已完成区都支持 Ctrl/⌘ 切换、Shift 连选；选中后操作出现在各自分区的标题栏，可批量删除并整批撤销，机制见[任务多选](../../dev/logic/task-multi-select.md)。
- 验证：`frontend/src/utils/completedGroups.test.js` 覆盖分组、组内排序、标题与空值。

## 截止时间胶囊（2026-11-20）

- 需求：日期清除逻辑交回任务行/快速添加栏的截止标签（胶囊），面板里不再重复放「清除」。
- 实现：[DateTimePicker.vue](../../../../frontend/src/components/DateTimePicker.vue) 新增 `triggerClear`：截止标签入口开启后，胶囊右侧悬停露出 ×（胶囊撑开右内边距让位），点击清空 `v-model` 并 `confirm`；面板内的「清除」在 `triggerClear` 时不再渲染。
- 保留：详情编辑器与日程详情面板用默认输入框触发器，清除仍在面板内，避免点输入框右侧误清空。
- 机制见[日期时间选择器](../../dev/logic/date-time-picker.md)。

本页其余内容待补充。
