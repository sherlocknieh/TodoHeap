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
        ├─ 3. 把临时 ID 追加到父级 child_ids（父级默认是根任务）
        └─ 4. syncQueue.enqueue({ type: 'ADD', targetId: 临时ID, payload })
                │
                ▼
        processQueue → executeAdd
                │
                ├─ 父级仍是临时 ID 时跳过，等父级落地
                ├─ supabase.rpc('create_todo', { ..., p_client_key })
                │       └─ 服务端：插入 todos 行 + array_append 到父级 child_ids
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

| 入口 | 说明 |
| --- | --- |
| `TodoList.vue` 快速添加 | `addTodo(title, { deadline: null })`，默认挂根任务 |
| `TodoList.vue` 新建子任务 | `addTodo('(新任务)', { parent_id })`，随后进入行内编辑 |
| `TodoGraph.vue` / `MindMapWrapper.vue` | Enter 建同级、Tab 建子级；同级创建后调 `moveTodo` 调整到落点之后 |
| `Todo.vue` 顶部新建 | `addTodo('新任务', { details: '' })` |
| `TodoDetailEditor.vue` | 在详情面板里新建子任务 |
| `agentTools.js` | Agent 工具复用 `addTodo`，顶层任务同样挂根 |
| `ticktickImport.js` | 导入走 `create_todo` RPC，用 `external_id` 去重，不传 `client_key` |

除导入外所有入口都收敛到 `addTodo`，幂等键只需在这一处生成。

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
cd frontend && npm run build
```

用例：

- `todos.optimistic.test.js`：`addTodo` 生成并下发 `client_key`、复用调用方传入的键；
- `todos.realtime.test.js`：`INSERT` 命中本地 `client_key` 时走 ID 替换而非新增；无匹配时正常追加；
- `syncQueue.clientKey.test.js`：缺 `client_key` 支持时退回旧签名、之后不再重复试错、支持时只调一次。

数据库：远程推送用 `npx supabase db push --yes --db-url "<pooler 连接串>"`；本机无 Postgres 时可用 PGlite 按时间戳顺序校验迁移。
