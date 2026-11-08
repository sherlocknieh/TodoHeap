# TodoHeap 项目索引

> 给 agent 的导航文件：**先读这一份，再按需打开具体文件**，不要为了了解结构而全量阅读源码。

## 一句话

AI 辅助的任务管理应用：Vue 3 前端 + Supabase（Postgres / Auth / Realtime / Edge Functions）。
仓库含三个可独立安装的子项目：`frontend/`（应用）、`docs/`（VitePress 文档）、`supabase/`（迁移与边缘函数）。

## 目录地图

| 路径 | 职责 |
| --- | --- |
| `frontend/src/` | 应用源码，见下文 |
| `frontend/vite.config.ts` | `base: '/TodoHeap/'`、构建输出 `../dist`、`@` → `src` 别名 |
| `docs/` | VitePress 站点，`base: '/TodoHeap/docs/'`，中英双语（`zh/`、`en/`），侧栏由 `vitepress-sidebar` 自动生成 |
| `supabase/migrations/` | 按时间戳排序的 SQL 迁移，**数据库结构的唯一事实来源** |
| `supabase/functions/` | Deno 边缘函数 |
| `.github/workflows/deploy.yaml` | push 到 main 且改动 `docs/`、`frontend/` 时，构建两者并发布到 GitHub Pages |
| `dist/` | 混合部署产物，已 gitignore |

## 常用命令

| 场景 | 命令 |
| --- | --- |
| 启动应用 | 根目录 `pnpm dev`（= `cd frontend && pnpm dev`，端口 5200） |
| 启动文档 | 根目录 `pnpm dev:docs`（端口 5201） |
| 两者同时 | `pnpm dev:all` |
| 构建前端 | `cd frontend && npm run build` |
| 单元测试 | `cd frontend && npm test`（vitest，仅覆盖 store 层） |
| 类型检查 | `cd frontend && npm run type-check`；⚠️ vue-tsc 1.8 与 TS 5.9 不兼容会直接崩，属已知问题，不是新引入的错误 |

`frontend/` 与 `docs/` 各自安装依赖，仓库根只装 `concurrently`。

## 前端结构 `frontend/src`

| 文件 | 职责 |
| --- | --- |
| `main.ts`、`App.vue` | 入口，仅 `<RouterView />` |
| `router/index.ts` | hash 路由；`/app` 需登录，子路由 `list` / `tree` / `heap` / `trash`；`/settings` 是顶层路由 |
| `pages/Todo.vue` | 工作区外壳：活动栏、侧栏、中栏、详情面板、状态栏；子视图由 `<router-view>` 注入 |
| `pages/todo/TodoList.vue` | 列表视图：快速添加 + 树形缩进的扁平列表 |
| `pages/todo/TodoTree.vue` | 树视图，仅容器，实际渲染 `MindMapWrapper` |
| `pages/todo/TodoHeap.vue` | 堆视图（侧栏入口已注释，路由仍可达） |
| `pages/todo/Trash.vue` | 回收站：恢复、永久删除、清空，含越级删除的恢复限制弹窗 |
| `pages/todo/Settings.vue` | 设置：账户信息、改密、删号、AI 偏好 |
| `pages/{Home,Login,ResetPassword,404}.vue` | 落地页与认证页 |
| `lib/supabase.ts` | 唯一 Supabase client，读 `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUB_KEY` |
| `lib/userSettings.js` | `user_settings` 表读写与 `DEFAULT_USER_SETTINGS` |
| `utils/priorityCalculator.js` | 堆视图打分（紧急度 + 进度 + 复杂度），纯函数 |
| `utils/detailPanelContext.js` | provide/inject key，供深层组件打开详情面板 |
| `style.css` | Tailwind v4 入口 + 设计令牌（`accent-*` 色阶）+ 基元类 |

组件（`frontend/src/components/`）：

| 文件 | 职责 |
| --- | --- |
| `AppIcon.vue` | 线性图标全集（`name` + `size`），全站唯一图标来源 |
| `LeftSidebar.vue` | 视图切换、统计、全局优化入口 |
| `TodoListItem.vue` | 单条任务行：缩进、折叠、两态复选、行内菜单、AI 分解入口 |
| `TodoDetailEditor.vue` | 右栏详情：标题、起止时间、难度、Markdown 描述 |
| `MilkdownEditor.vue` | Milkdown Markdown 编辑器封装 |
| `MindMapWrapper.vue` | simple-mind-map 封装，负责与 todos 树互转 |
| `AITaskInput.vue` | 自然语言输入与分析进度 |
| `BreakdownStatusCard.vue` | 分解状态：进行中 / 待确认 / 成功 / 失败 |
| `OptimizeProgressCard.vue` | 全局优化进度与变更摘要 |
| `SyncStatusIndicator.vue` | 同步状态徽章（当前未被引用） |

### 状态管理

`stores/todos.js` 是门面，其余切片装配进去。改同步逻辑时按职责定位文件：

| 文件 | 职责 |
| --- | --- |
| `stores/todos.js` | 主 store：拉取、树构建、CRUD 入口、realtime 状态 |
| `stores/todos.optimistic.js` | 乐观更新与级联（删父删子等） |
| `stores/todos.rollback.js` | 失败回滚 |
| `stores/todos.realtime.js` | Supabase Realtime 订阅与重连 |
| `stores/todos.breakdown.js` | 三个 AI 边缘函数的调用封装（分解 / 新建 / 优化） |
| `stores/syncQueue.js` | 离线队列（localforage 持久化）、临时 id 替换与重放 |
| `stores/auth.ts` | Supabase Auth 会话 |
| `stores/todos.*.test.js` | vitest 覆盖乐观更新与回滚 |

写操作链路：UI → `todos.js` action → 本地乐观更新并入队 → Supabase → 成功派发 `sync:id-replaced` / 失败回滚。

## Supabase

`todos` 表：`id, user_id, parent_id, title, details, deadline, difficulty(工时, DECIMAL(5,2)), sort_order, completed_at, created_at, updated_at, deleted_at`；已启 RLS，删除是软删除（`deleted_at`），完成状态由 `completed_at` 是否为空判定，`updated_at` 由触发器维护。
`user_settings` 表：用户偏好，如 `autoApplyAITasks`。
`schedules` 表：日程事件，`id, user_id, todo_id(可空), title, notes, start_at, end_at, created_at, updated_at`；已启 RLS 与 Realtime。

| 边缘函数 | 作用 |
| --- | --- |
| `breakdown_task` | 把选定任务拆成 3-6 个子任务，返回 JSON 数组 |
| `new_task_ai` | 自然语言 → 新建任务树 |
| `optimize_tasks` | 全局优化：调日期、拆解、聚合、生成执行建议（AI SDK + tool calling） |

密钥只放 Supabase secrets 与 GitHub Actions vars/secrets；前端仅持 `VITE_SUPABASE_PUB_KEY`。

## 约定

- **UI**：颜色只用 `neutral-*` 与 `accent-*`，配 `.panel` / `.field` / `.btn-*` / `.chip` / `.eyebrow` 基元；图标一律用 `AppIcon`，**不要用 emoji**；圆角以 `rounded-md` 为主，避免大阴影与渐变。
- **完成状态判定用 `completed_at` 是否为空**，不存在 `status` / `completed` 字段。
- 中文注释描述"这段代码负责什么"，不写步骤流水账。
- 部署路径带 `/TodoHeap/` 前缀，资源引用不要写死站点根路径。

## 改动的验证

- 前端：`cd frontend && npm run build`；涉及 store 再 `npm test`
- 数据库：结构以 `supabase/migrations/20261108000000_init_schema.sql` 为基线；后续变更新增 `<timestamp>_*.sql`，**不要修改基线**
- 文档：`cd docs && npm run build`（配置已关闭 `ignoreDeadLinks`，死链会直接中断构建）
