---
title: "完成任务树"
---
# 完成任务树

任务表行内菜单与任务图节点菜单的「完成任务及全部子任务」共用同一套链路：从被点的任务出发，沿 `child_ids` 收集整棵子树，只把其中未完成的任务写成完成。

## 收集范围

- 起点是任务的真实 ID；回边行（同一任务在另一父级下的引用）与实体行落到同一 ID，从任一处操作效果一致。
- `child_ids` 决定父子关系，允许多父与环：`collectDescendantIds` 用 `visited` 防环，`collectIncompleteTreeIds` 因此不会重复返回多父任务。
- 只收集 `completed_at` 为空的任务；已完成的后代保留原完成时间，不会被刷新成这一次的时间。
- 已删除或已不存在的子 ID 直接跳过，不阻止其余子树完成。

## 写入与撤销

- `completeTodoTree` 生成一个统一的完成时刻，逐条调用 `updateTodo`；已完成区按天分组时，整棵树落在同一天。
- 返回真正被改写的 ID 列表；页面提示里的撤销把这些任务的 `completed_at` 写回 `null`。
- 起点本身已完成、且没有未完成后代时返回空列表，页面不弹提示。
- 任务图根节点没有菜单，不能作为完成入口。

## 验证

- `frontend/src/utils/taskGraph.test.js` 的 `collectIncompleteTreeIds`：跳过已完成、环内终止、多父去重、任务不存在返回空。
