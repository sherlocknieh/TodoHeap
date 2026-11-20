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
- 验证：`frontend/src/utils/completedGroups.test.js` 覆盖分组、组内排序、标题与空值。

本页其余内容待补充。
