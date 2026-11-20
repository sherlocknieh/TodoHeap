---
title: "任务图删除后的焦点落点"
---
# 任务图删除后的焦点落点

删除节点后不把选中丢空，而是落到它最近的兄弟节点，方便继续用键盘改名、删除或新建。兄弟顺序仍由父级 `child_ids` 决定（见[任务顺序](./task-order.md)），不按布局的视觉距离重算。

## 落点规则

| 情况 | 焦点 |
| --- | --- |
| 有下一个兄弟 | 下一个兄弟 |
| 没有下一个、有上一个 | 上一个兄弟 |
| 一个兄弟都没有 | 父任务 |
| 父级是根任务或找不到父级 | 取消选中，详情右栏收起 |

- 已被删除但残留在 `child_ids` 里的孤儿 ID 不参与候选。
- 多父任务优先取导图当前展示的那条父链（`buildTaskForest` 写回的 `parent_id`），这条链没有可用兄弟时再换其它父级。
- 焦点只走单选：批量删除仍清空选中，见[任务图节点多选](./graph-multi-select.md)。

## 实现

- `utils/taskGraph.js` 的 `findDeleteFocusId(items, id, { parentId, preferNext })` 只读任务数组，返回下一个任务 ID 或 `null`，可单测。
- `TodoGraph.vue` 的 `deleteTask` 在软删除前先算落点，删除成功后发 `task-selected`；批量入口 `deleteTasks` 不发焦点。
- 选中变化会触发 `MindMapWrapper` 的可见性修正：兄弟在视口外时最小平移带回，被折叠时先展开祖先链（见[任务图选中项的可见性修正](./mindmap-selection-visibility.md)）。详情右栏随选中一起切到兄弟。

## 验证

- `cd frontend && npm test`：`taskGraph.test.js` 覆盖下一个优先、回退上一个、父任务兜底、根任务返回 `null`、多父展示链与孤儿 ID。
- 手动：中间节点按 Delete 后选中下一项；末尾节点 Delete 后选中上一项；独生子 Delete 后选中父任务；顶层唯一任务 Delete 后右栏收起。
