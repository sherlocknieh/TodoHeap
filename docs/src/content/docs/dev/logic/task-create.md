---
title: "任务创建逻辑"
---
# 任务创建逻辑

新建一条任务从界面到落库的完整链路，以及保证「同一次创建只产生一条记录」的幂等设计。

---

## 一、涉及的文件

| 文件 | 职责 |
| --- | --- |
| `frontend/src/stores/todos.optimistic.js` | `addTodo`：本地乐观插入 + 入队；`updateTodo` 对临时任务改队列 payload |
| `frontend/src/stores/syncQueue.js` | 队列持久化、并发调度、`executeAdd` 调 RPC、临时 ID → 真实 ID 映射、旧库退化 |
| `frontend/src/stores/todos.js` | `handleIdReplaced` 替换本地记录、`fetchTodos` 合并服务端与本地临时数据 |
| `frontend/src/stores/todos.realtime.js` | Realtime 推送处理，`INSERT` 时按 `client_key` 认领本地临时任务 |
| `supabase/migrations/20261117000400_functions.sql` | `create_todo` RPC：插入任务并挂到父级 `child_ids` |
| `supabase/migrations/20261118000000_todo_client_key.sql` | 已部署库的增量升级：`client_key` 列、唯一索引、`create_todo` 新签名 |
| `supabase/migrations/20261118000100_drop_legacy_create_todo.sql` | 删除 `create_todo` 的旧重载 |

---

## 二、创建链路

```
UI（列表回车 / 图里 Enter、Tab / 详情面板 / Agent 工具 / 顶部新建）
        │
        ▼
todoStore.addTodo(title, options)
        │
        ├─ 1. 生成临时 ID（负数，如 -1）与 client_key（uuid）
        ├─ 2. 构造本地任务，push 进 todos
        ├─ 3. 把临时 ID 插到父级 child_ids 首位（父级默认是根任务）
        └─ 4. syncQueue.enqueue({ type: 'ADD', targetId: 临时ID, payload })
                │
                ▼
        processQueue → executeAdd
                │
                ├─ 父级仍是临时 ID 时跳过，等父级落地
                ├─ supabase.rpc('create_todo', { ..., p_client_key })
                │       └─ 服务端：插入 todos 行 + 头插到父级 child_ids
                ├─ tempIdMap.set(临时ID, 真实ID)
                ├─ updateQueueTargetIds：队列里后续操作的临时 ID 一并替换
                └─ dispatchEvent('sync:id-replaced', { tempId, realId, data })
                        │
                        ▼
                todos.js handleIdReplaced
                        ├─ 所有父级 child_ids 里的临时 ID 换成真实 ID
                        ├─ 用服务端返回行替换本地临时项，合并本地已挂的子任务
                        ├─ 队列里还有该任务的 UPDATE 时保留其字段，避免界面回退成旧值
                        └─ 把真实 ID 补挂回父级（不必等 Realtime）
```

RPC 响应与 Realtime 推送谁先到不确定，两者都通过 `client_key` 收敛到同一条记录。

### 临时 ID 期间的更新

新建后立刻改名/改其他字段时，调用方手里还是临时 ID，`updateTodo` 按 ADD 的状态分四种处理：

| ADD 状态 | 处理 |
| --- | --- |
| 仍在队列、尚未发出 | 直接改队列项 payload，创建时带上的就是最新值 |
| 仍在队列、已经发出 | 改 payload 之外再补一条 `UPDATE`，等真实 ID 映射后按真实 ID 执行 |
| 已成功（队列项已移除、映射已建立） | 按真实 ID 入队 `UPDATE`，**不能**再补 `ADD` |
| 尚未入队（`deferSync`） | 补一条 `ADD`，沿用已有的 `client_key` |

判断「已经发出」用 `syncQueue.isOperationActive(operationId)`。这一步不能省：请求发出后再改 payload 不会影响服务端，改名会丢。

### 父级 child_ids 更新的顺序约束

任务图的同级/子级新建除了 `ADD`，还会立刻入队一条父级 `UPDATE`，把新任务重排到落点；这条 payload 的 `child_ids` 里通常还是临时 ID。

`processQueue` 按 `targetId` 并行（不同 target 最多 5 条）。父级 `UPDATE` 若与 `ADD` 同时发出会有两个后果：

- 负数临时 ID 直接写进父级的 `child_ids`；
- `UPDATE` 返回的是发出时的快照，缺少 `create_todo` 刚补上的真实 ID，`sync:update-success` 又用它整条覆盖本地父级。

父级一旦丢掉新任务，导图会把这条没有父链接的任务当成森林根挂到根节点（`TodoGraph` 的 `orphans`），表现为「新建后多出一条根链接，刷新后恢复正常」。

因此 `selectExecutableItems` 把 `payload.child_ids` / `payload.ids` 里的未映射临时 ID 也当作依赖：

- 对应 `ADD` 还在队列（含执行中）时等下一轮；
- `ADD` 已回滚、临时 ID 不会再落地时，把死引用从 payload 剔除，避免队列一直等待；
- 落地后 `updateQueueTargetIds` 会先把 payload 换成真实 ID 再发出。

### 临时 ID 编号与残留清理

临时 ID 由 `generateTempId` 生成，为负数、只存在于本地。旧实现每次页面重载都从 `-1` 重新计数，而父级 `child_ids` 里可能还留着更早写进去的负数（旧版队列会把临时 ID 落库）。两条 `-8` 一撞，`sync:id-replaced` 的 ID 替换会把那条残留引用一起改成新任务，导图里就凭空多出一条父链接。

现状：

- 起点改为时间 + 随机数，重载后不再复用 `-1`、`-2` 这类小编号；
- `fetchTodos` 用 `withoutStaleTempChildIds` 剔除服务端行 `child_ids` 里的负数残留，本地不再保留幽灵引用；
- 迁移 `20261121000000_strip_temp_child_ids.sql` 清理库里已经存在的负数引用。

### 换号时保持编辑态

新建后立刻进入行内编辑时，临时 ID 换成真实 ID 会触发重新渲染。要让打字不被打断，需要两件事：

- 导图的节点与任务表的行都用 `client_key` 作渲染 key（`TodoGraph` 的 `renderKey`、`TodoListItem` 的 `:key`）：换号前后是同一个 DOM 元素，输入框不被卸载，焦点与已输入内容都保留。
- `sync:id-replaced` 到达时把编辑中的 ID 迁到真实 ID，并恢复换号前的选区；任务表不能再用 `select()` 全选，否则下一次按键会覆盖已输入的文字。

没有稳定 key 时，换号会重建整棵节点/行子树，表现为输入框闪断、丢字。

---

## 三、幂等键 `client_key`

### 数据层

```sql
-- todos 表
client_key TEXT DEFAULT NULL   -- 客户端生成的创建幂等键

-- 同一用户下幂等键唯一，手工任务（NULL）不参与
CREATE UNIQUE INDEX idx_todos_user_client_key ON todos(user_id, client_key)
WHERE client_key IS NOT NULL;
```

### 前端

- `addTodo` 生成 `client_key`（可由调用方通过 `options.client_key` 传入以复用），写入本地任务对象，并随 `ADD` 队列的 payload 下发。
- `deferSync` 创建的临时任务在首次编辑补入 `ADD` 时，沿用已有的 `client_key`。
- `executeAdd` 把 `payload.client_key` 作为 `p_client_key` 传给 RPC。

### 服务端 `create_todo`

```sql
IF p_client_key IS NOT NULL THEN
    SELECT * INTO created FROM public.todos
    WHERE user_id = auth.uid() AND client_key = p_client_key;
    IF FOUND THEN
        -- 命中已建记录：只补挂父级，保证不会出现孤立任务
        ...
        RETURN created;
    END IF;
END IF;

INSERT INTO public.todos (..., client_key)
VALUES (..., p_client_key)
ON CONFLICT (user_id, client_key) WHERE client_key IS NOT NULL DO NOTHING
RETURNING * INTO created;

IF NOT FOUND THEN
    -- 并发下另一请求已用同一 client_key 建好，复用那条记录
    SELECT * INTO created FROM public.todos
    WHERE user_id = auth.uid() AND client_key = p_client_key;
END IF;
```

- 重试与并发都返回同一条记录；
- 命中已有记录时仍补挂父级；
- 手工任务 `client_key` 为 `NULL`，不受唯一索引约束；
- `p_client_key` 带默认值，不传也能调用。

### Realtime 认领

`todos.realtime.js` 的 `INSERT` 分支先按 `client_key` 找本地临时任务，命中就走与 RPC 响应完全相同的 `sync:id-replaced` 流程：

```js
const claimLocalTempTodo = (record) => {
  if (!record?.client_key) return false
  const local = todosRef.value.find(
    (todo) => todo.client_key === record.client_key && getSyncQueue().isTempId(todo.id)
  )
  if (!local) return false

  window.dispatchEvent(new CustomEvent('sync:id-replaced', {
    detail: { tempId: local.id, realId: record.id, data: record }
  }))
  return true
}
```

因此无论推送和响应谁先到，界面上都只有一条。

### 刷新合并

`fetchTodos` 保留本地临时任务时，剔除服务端已存在同 `client_key` 的项：

```js
const serverClientKeys = new Set(serverTodos.map(t => t.client_key).filter(Boolean))
const localTempTodos = todos.value
  .filter(t => syncQueue.isTempId(t.id))
  .filter(t => !(t.client_key && serverClientKeys.has(t.client_key)))
```

---

## 四、旧库退化

`client_key` 依赖数据库迁移。服务端缺少该结构时，带 `p_client_key` 的 RPC 会返回 `PGRST202` / `42703`，`executeAdd` 据此退回到不带幂等键的调用，避免创建整体失败：

```js
if (error && clientKey && isMissingClientKeySupport(error)) {
  clientKeySupported = false        // 本次会话后续不再尝试
  ;({ data, error } = await supabase.rpc('create_todo', rpcArgs))
}
```

- `isMissingClientKeySupport` 识别 `PGRST202` / `42883` / `42703` / `42P10`，以及消息中出现 `client_key`；
- 退化后失去 Realtime 认领，可能出现临时的临时项与真实项并存，但不会创建失败；
- 迁移落地后刷新页面即恢复幂等保护。

---

## 五、其他创建入口

插入位置（头插、落点之后、同级末尾）的完整规则见[任务顺序](./task-order.md)。

| 入口 | 说明 |
| --- | --- |
| `TodoList.vue` 快速添加 | `addTodo(title, { deadline })`，可在添加栏先选截止时间；默认挂根任务 |
| `TodoList.vue` 新建子任务 | `addTodo(nextTaskTitle(...), { parent_id })`，默认标题 `(新任务)` 同样参与编号，随后进入行内编辑 |
| `TodoGraph.vue` / `MindMapWrapper.vue` | Enter 建同级、Tab 建子级；同级创建后调 `moveTodo` 调整到落点之后，子级/顶层创建追加到同级末尾（不受列表的新建置顶影响）；标题按下面的编号规则生成 |
| `Todo.vue` 顶部新建 | `addTodo(nextTaskTitle(...), { details: '' })`，连续点击得到 `新任务 1`、`新任务 2` |
| `TodoDetailEditor.vue` | 在详情面板里新建子任务，标题由用户输入，不参与自动编号 |
| `agentTools.js` | Agent 工具复用 `addTodo`，顶层任务同样挂根；标题由工具参数给出 |
| `ticktickImport.js` | 导入走 `create_todo` RPC，用 `external_id` 去重，不传 `client_key` |

除导入外所有入口都收敛到 `addTodo`，幂等键只需在这一处生成。

### 连续新建时的标题编号

连续添加同级任务时标题会重复，编号让每条新任务可区分。规则只看父级 `child_ids` 的同级标题，与视图和布局无关：

| 情况 | 新标题 | 例子 |
| --- | --- | --- |
| 参考标题末尾有数字 | 数字 +1，保留分隔符与数字位数，跳过已占用的同级标题 | `步骤 2` → `步骤 3`、`步骤 09` → `步骤 10` |
| 参考标题末尾没有数字 | 默认标题从 1 开始取最小未占用编号 | `新任务 1`、`新任务 2` |
| 没有参考标题（建子级、顶栏新建、列表新建子任务） | 同上，默认标题编号 | 子级为 `新任务 1`；列表子任务沿用占位外壳 `(新任务) 1` |

- 参考标题就是「在哪个节点上按 Enter」：Task 图同级新建取 `afterId` 对应任务的标题。因此 `新任务 1` 再按 Enter 会续成 `新任务 2`。
- 子级入口没有同级参考，只在目标父级的现有子任务里取编号；同一父级下连续 Tab 会得到 `新任务 1`、`新任务 2`。
- 已占用的编号会跳过，例如同级已有 `步骤 3` 时，`步骤 2` 之后创建得到 `步骤 4`。
- 编号依赖 `addTodo` 同步把临时 ID 头插进父级 `child_ids`：连续快速新建时下一次计算已经能看到上一条，不会重号。
- 实现集中在 `utils/taskTitle.js`：`nextTaskTitle(referenceTitle, siblingTitles, { baseTitle })` 生成标题，`childTitlesOf(items, parentId)` 按 `child_ids` 顺序取同级标题并跳过不存在的 ID。调用点只有 `TodoGraph.createTask`、`TodoList.addSubtask`、`Todo.createNewTask`。

---

## 六、修改 `create_todo` 的约束

`CREATE OR REPLACE FUNCTION` 只在参数列表完全一致时替换。新增参数会生成一个**重载**，旧签名同时留在库里，PostgREST 带命名参数调用时无法在候选间选定，返回 `PGRST203`，创建全部失败。

因此调整 `create_todo` 参数时必须同时 `DROP` 旧签名：

```sql
DROP FUNCTION IF EXISTS public.create_todo(TEXT, TEXT, TIMESTAMPTZ, NUMERIC, TIMESTAMPTZ, BIGINT, TEXT);
```

---

## 七、验证

```bash
cd frontend && npm test        # todos.optimistic / todos.realtime / syncQueue 用例
cd frontend && nub run build
```

用例：

- `todos.optimistic.test.js`：`addTodo` 生成并下发 `client_key`、复用调用方传入的键；
- `taskTitle.test.js`：末尾数字续号与前导零、已占用编号跳号、默认标题从 1 编号、同级标题按 `child_ids` 取；
- `todos.realtime.test.js`：`INSERT` 命中本地 `client_key` 时走 ID 替换而非新增；无匹配时正常追加；
- `syncQueue.clientKey.test.js`：缺 `client_key` 支持时退回旧签名、之后不再重复试错、支持时只调一次；
- `syncQueue.idmap.test.js`：`child_ids` 里的临时 ID 未落地时父级 `UPDATE` 不发送、落地后按真实 ID 发送；临时任务已回滚时剔除死引用；
- `taskGraph.test.js`：`withoutStaleTempChildIds` 剔除父级 `child_ids` 里残留的负数临时 ID。

数据库：远程推送用 `npx supabase db push --yes --db-url "<pooler 连接串>"`；本机无 Postgres 时可用 PGlite 按时间戳顺序校验迁移。
