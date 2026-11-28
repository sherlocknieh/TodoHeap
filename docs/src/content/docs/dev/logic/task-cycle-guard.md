---
title: "环形依赖的写入拦截"
---
# 环形依赖的写入拦截

`child_ids` 允许多父，但不允许成环：把父任务挂到自己后代下会让父链、删除传播、完成任务树全部失去终点。拦截分两层，前端统一拦截负责给出即时反馈，数据库触发器兜底防止绕过。

## 判定条件

新增一条「父 P → 子 C」链接会成环，当且仅当：

- `P === C`；或
- `C` 的子树里能到达 `P`（`collectDescendantIds` 包含 `P`）。

判定只针对**本次新增**的子 ID，已有链接不重新校验。这样历史数据里残留的环仍可读写，用户也能把环里的某条边拆掉。

## 前端：统一拦截

`stores/todos.optimistic.js` 的 `updateTodo` 是所有本地写入口的必经之路（详情面板、拖拽、列表、Agent 工具都走它）：

```js
const previous = new Set((originalTodo.child_ids || []).map(String))
const addsCycle = updates.child_ids
  .filter((childId) => !previous.has(String(childId)))
  .some((childId) => wouldCreateCycle(todosRef.value, realId, childId))
if (addsCycle) return { success: false, error: '禁止形成环形依赖' }
```

- 判定工具是 `utils/taskGraph.js` 的 `wouldCreateCycle(items, parentId, childId)`，与 `collectDescendantIds` 共用遍历，历史环只遍历一次。
- 校验发生在乐观写入与入队之前：失败时列表、快照、同步队列都不动。
- 入口侧再补一层提示与过滤：
  - 详情面板「链接为子任务」的候选列表排除自身、已有子级与自己全部后代（`linkCandidates`）；
  - Agent 工具 `link_todo` / `move_todo` 提前报错，消息分别是「不能把父任务链接到它自己的子任务下」「不能把任务移动到它自己的子任务下」；
  - 任务图拖拽仍是原有拦截，提示「禁止形成环形依赖」。

## 数据库：触发器兜底

`supabase/migrations/20261129000000_prevent_todo_cycles.sql` 增加 `trg_todos_prevent_cycle`（`BEFORE INSERT OR UPDATE OF child_ids`）：

- 与前端同口径：只取 `NEW.child_ids` 里不在 `OLD.child_ids` 中的 ID；
- 递归查询每个新增子任务的子树，命中 `NEW.id` 就 `RAISE EXCEPTION '禁止形成环形依赖'`；
- 递归用 `path` 数组剪断历史环，不会无限递归；
- `child_ids` 未变化时直接放行，所以重排、只改其它字段、删除子链接都不受影响。

`append_todo_children` 等通过 `UPDATE ... child_ids` 追加链接的数据库函数同样会被这个触发器检查。

## 历史数据

不清理已有环：迁移不删除任何链接。渲染与遍历侧继续容错（Tarjan 缩点、`visited` 防环、父链祖先去重），用户可以从详情面板或任务图手动断开成环的那条边。

## 验证

- `frontend/src/utils/taskGraph.test.js` 的 `wouldCreateCycle`：后代、自身、无关任务、反向挂载、历史环、缺参。
- `frontend/src/stores/todos.optimistic.test.js`：新增环被拒绝且不写乐观状态/不调用 `saveSnapshot`/不入队；历史环数据做非新增子级的修改仍放行。
- `frontend/src/lib/agentTools.test.js`：`link_todo` 链接自己后代时失败。
- 数据库：用 PGlite 建最小 `todos` 表后执行本迁移，验证正常挂载、自己挂自己、父任务挂到孙子下、重排、新任务自带子 ID、去链接、历史环改其它字段七种情况。
