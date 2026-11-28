---
title: "任务表筛选与平铺"
---
# 任务表筛选与平铺

本页说明任务表（列表视图）的日期筛选与叶子筛选怎么改变渲染树，以及为什么平铺期间关闭层级写入。界面行为见[视图与交互](../../features/views.md)。

## 数据链路

- 源树 `baseTree` 由 `utils/rootTask.js` 的 `listTreeOf` 去掉根挂载点得到。
- `sortedTree` 依次应用两种筛选：`leafOnly` 先用 `flattenLeafTasks` 收成平铺列表，`dateOnly` 再用 `flattenTasksByDeadline` 按截止时间升/降序；两者都关时直接返回原树。
- 平铺结果每行 `children: []`，行内 `flattenTree` 得到的 `_level` 为 0，不画树状连线；`foldableTasks` 也为空，全部展开/折叠按钮自动隐藏。
- 搜索在筛选之后执行（`filterTasksByTitle`）；平铺行没有子级，搜索不会补出祖先上下文。

## 叶子判定

- 叶子 = 没有未完成子任务，与行内折叠开关的口径一致（`TodoListItem.vue` 的 `hasActiveChildren`）：子任务全部完成的父任务按叶子处理，仍然出现在结果里。
- 引用行（`_isRef`）不参与收集；遍历按树序深度优先，保留手动顺序，结果行不带层级。

## 约束

- `isFlatFilter = dateOnly || leafOnly` 为真时：`TodoListItem` 的「添加子任务」置灰、拖拽禁用，`handleListKeydown` 不响应 Tab/Enter 新建。原因是没有层级上下文，新建的子任务会立刻被筛选掉。
- 两个开关与日期方向都存在 localStorage（`todoheap:list-date-only`、`todoheap:list-leaf-only`、`todoheap:list-date-order`），只影响显示，不写数据库。
- 筛选菜单点击外部或按 Esc 关闭（`handleFilterClickOutside`、`handleListKeydown`）。
- 新建任务时若日期筛选开启且未设截止时间，自动关掉日期筛选让新行可见；叶子筛选下新任务本就是叶子，无需额外处理。

## 验证

- 自动：`cd frontend && npx vitest run src/utils/todoSort.test.js`。
- 手动：`/TodoHeap/app/#/list` 下打开筛选菜单分别开关两项，确认结果拍平、无树线、无展开/折叠按钮；两项同开时先取叶子再按截止时间排序。行菜单「添加子任务」置灰，拖拽与 Tab/Enter 新建无响应。
