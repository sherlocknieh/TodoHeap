---
title: "任务顺序"
---
# 任务顺序

本页说明任务在兄弟之间的顺序由什么决定、各界面新建时插到哪里，以及这套顺序机制的读写成本。功能行为见[视图与交互](../../features/views.md)，创建链路见[任务创建逻辑](./task-create.md)。

## 顺序的唯一来源

- 父节点的 `child_ids BIGINT[] NOT NULL DEFAULT '{}'`（`supabase/migrations/20261117000000_schema_tables.sql`）就是同级显示顺序，数组下标即手动顺序；没有额外的 `sort_order` 字段。
- 一个任务可以有多个父级、也可以成环；顺序按每条父链各自保存，同一个任务在不同父级下可以有不同位置。
- `child_ids` 上有 GIN 索引（`supabase/migrations/20261117000100_schema_indexes.sql`），用于按「包含某子任务」反查父级，不参与排序。

## 新建时插到哪里

| 入口 | 插入位置 | 落点 |
| --- | --- | --- |
| 列表快速添加、顶部新建、详情面板新建子任务、Agent 工具、列表新建子任务 | 父级 `child_ids` 首位 | `stores/todos.optimistic.js` 的 `addTodo` |
| 节点图 Enter 建同级 | 当前节点之后 | `TodoGraph.vue` 的 `createTask`，`afterId` 分支 |
| 节点图 Tab / 出边加号 / 菜单「新建子任务」/ 根节点上新建 | 同级末尾 | `TodoGraph.vue` 的 `createTask`，`afterId == null` 分支 |

- 列表类入口的「最近添加先看到」由两端共同保证：`addTodo` 本地头插临时 ID，服务端 `create_todo` 也头插真实 ID（`supabase/migrations/20261118000200_create_todo_prepend.sql`），刷新或实时回推不会把新任务拉回末尾。
- `create_todo` 命中 `client_key` 的重试分支同样头插，保证重试与首次创建的位置一致。
- 节点图不沿用这套头插：`createTask` 在 `addTodo` 之后调用 `moveTodo` 重排。Enter 建同级用 `position: 'after'` 落在当前节点下一位；`afterId == null` 的入口取父级 `child_ids` 中最后一个仍存在的兄弟作为落点，追加到末尾。
- 父级是合成根或根任务尚未拉到时不强行重排：`addTodo` 把任务挂到根任务，`createTask` 用返回记录的 `parent_id` 找回父级；找不到父级时保持服务端结果。

## 重排链路

- `moveTodo` 先按 `child_ids` 计算目标父级的兄弟序列（去掉自己），再按落点下标插入；`position` 为 `after` / `before` 时插到落点前后，`inside` 时成为落点子任务。删除后仍留在数组里的孤儿 ID 会追加到末尾，不会因重排丢失。
- 换父级时只摘掉来源父级那一条链接，多父任务的其它来源保持不变。
- 每次重排最终都是一次父级 `child_ids` 的 UPDATE。新节点的 ADD 还在队列里时，UPDATE 里的临时 ID 由 `syncQueue.updateQueueTargetIds` 在 ADD 落地后统一替换成真实 ID。
- `sync:id-replaced` 事件会把所有父级 `child_ids` 中的临时 ID 就地替换成真实 ID（`stores/todos.js` 的 `handleIdReplaced`），因此队列中的重排与服务端返回的记录收敛到同一顺序。

## 显示

- `buildTaskForest`（`utils/taskGraph.js`）完全按 `child_ids` 的顺序深度优先展开；任务首次出现是普通节点，再次出现收缩为回边引用节点。
- `withLocalChildLinks`（`stores/todos.js`）在构树前把「已有 `parent_id` 但还没写进父级 `child_ids`」的临时任务补到父级末尾；已经存在的 ID 由 Set 去重，不改变原有顺序。
- 列表视图在 `treeNodes` 之上再套一层排序（`TodoList.vue` 的 `sortTodoTree`）：手动模式保持 `child_ids` 顺序，其它模式按截止时间等重排；排序只影响展示，不回写 `child_ids`。
- 节点图的同层顺序同样来自 `child_ids` 的深度优先序；布局只负责把同层节点排开，不重新定义兄弟顺序。

## 性能

每次新建或重排只有一处集中写入：父级 `child_ids` 的整数组重写。头插与尾插的成本相同。

| 环节 | 成本 | 说明 |
| --- | --- | --- |
| 前端乐观更新 | O(k)，k 为兄弟数 | 复制一次 `child_ids`，头插和尾插都只差一次数组展开 |
| 服务端 `create_todo` / `moveTodo` | O(k) 复制数组 + 一次父行 UPDATE | 同时维护 `child_ids` 的 GIN 索引；行更新会进 WAL 与 Realtime |
| 客户端构树 | O(N)，N 为任务总数 | `child_ids` 一变，`treeNodes` computed 就重建整片森林 |
| 列表排序 | O(N log N) | `sortTodoTree` 在 `treeNodes` 变化后重跑，与插入位置无关 |
| DOM | 带 key 的列表只插入一个新节点 | 头插不会导致其它行整体移动 |

- 当前规模（根任务约 100 条、单个父级通常十几条子任务）这些成本都在亚毫秒到几毫秒级，插入首位没有可感知的性能影响。
- 节点图新建子级比列表多一次父级 `child_ids` UPDATE（先按服务端结果落库，再重排到末尾），同样是可忽略的小写入。
- 只有当单个父级的子任务达到数千条时，整数组重写才会变明显。届时的优化方向是避免每次重写整个数组（例如独立 `sort_order` 字段或单独的顺序表），而不是在头插与尾插之间取舍。

## 验证

- `cd frontend && npm test`：`todos.optimistic.test.js` 覆盖 `addTodo` 头插、`moveTodo` 的前后插序、跨层级移动与孤儿 ID 保留。
- `cd frontend && nub run build`：确认 `TodoGraph.vue` 与 `MindMapWrapper.vue` 的改动可编译。
- 手动：列表连续新建应出现在顶部；节点图 Enter 建同级落在当前节点下一位，Tab 建子级落在同级末尾。
