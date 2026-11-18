# TodoHeap 项目索引

> 本文件既做导航也放开工约定：**完整索引在 [代码地图](docs/src/content/docs/dev/code-map.md)**。开工先读那一页，再按需打开具体文件，不要为了了解结构而全量阅读源码。

AI 辅助的任务管理应用：Vue 3 前端 + Supabase（Postgres / Auth / Realtime / Edge Functions）。仓库含三个可独立安装的子项目：`frontend/`、`docs/`、`supabase/`。

## 文档分工

| 要知道什么 | 去哪里 |
| --- | --- |
| 目录地图、常用命令、文件职责、状态管理与 Supabase 结构 | [代码地图](docs/src/content/docs/dev/code-map.md) |
| 用户对界面的说法 → 代码位置 | [关键词索引](docs/src/content/docs/dev/keyword-index.md) |
| 机制与链路（为什么这样写、约束、如何验证） | [逻辑文档](docs/src/content/docs/dev/logic/index.md) |
| 产品目标与完整闭环 | [项目愿景与方案](docs/src/content/docs/dev/goals.md) |
| 系统设计、技术选型、数据库设计 | [架构与技术栈](docs/src/content/docs/dev/architecture.md) |
| 开发流程与常见任务 | [开发流程与任务](docs/src/content/docs/dev/development.md) |
| 按功能域记录当前实现 | [特性记录](docs/src/content/docs/features/index.md) |

## 开工流程

按「定位 → 核对约定 → 实现 → 验证 → 记录 → 提交」走，两条路径按所用工具选：

- **OpenCode**：直接按上述流程走，代码与 UI、数据模型、验证的细则见本文件下文。
- **Copilot**：分组目录里的 skill 由 `~/.config/opencode/sync-skills.sh` 按脚本内白名单链接到 `~/.agents/skills` 后即可发现，同样按上述流程；定位用的仓库文档见[代码地图](docs/src/content/docs/dev/code-map.md)、[架构与技术栈](docs/src/content/docs/dev/architecture.md)、[关键词索引](docs/src/content/docs/dev/keyword-index.md)，验证要求见本文件下文。

`dev-init` 只在本仓库缺 AGENTS.md 或约定过时时运行，日常开工用本文件的流程。

改完代码只用单测、构建、类型检查验证；
不要自行启动浏览器进行调试，必须先问用户。

## 记忆落点（自动执行，不需要用户提醒）

| 发生了什么 | 写到哪里 | 判据 |
| --- | --- | --- |
| 用户用现象描述界面 | `docs/src/content/docs/dev/keyword-index.md` | 说法 → 文件 + 锚点 |
| 新需求 | `docs/src/content/docs/features/` | 日期 / 需求 / 实现要点与文件 |
| 机制与根因 | `docs/src/content/docs/dev/logic/` | 受影响的机制、根因与修正后的现状逻辑 |
| 目录、命令、数据模型变化 | 本文件与[代码地图](docs/src/content/docs/dev/code-map.md) | 结构变化后立即同步 |

- 只记现状：行为改变直接改写原条目，不留历史变更；功能删减直接删掉对应描述。
- 同一对象的新说法并入同一条「用户可能说」列，用 ` / ` 分隔，保持一份不重复的对照表。
- 缺陷结论留在 `logic/`，不写进 features；没有篇目就新建并在该目录 `index.md` 登记。

## 项目约定

### 代码与 UI

- 界面配色限定在 `neutral-*` 与 `accent-*` 两套色阶内，并复用 `.panel` / `.field` / `.btn-*` / `.chip` / `.eyebrow` 基元，让所有页面保持同一套观感。
- 图标统一走 `AppIcon`，维持全站线性图标风格；emoji 会跳出这套视觉语言。
- 圆角、阴影保持克制（`rounded-md` 为主，无大阴影与渐变），让内容而不是容器占据注意力。
- 中文注释说明这段代码负责什么，让维护者不必逐行反推意图。
- 资源引用基于 `/TodoHeap/` 前缀，保证部署到子路径后仍能正确加载。

### 数据模型

- 完成状态只认 `completed_at` 是否为空，读写共用这一个事实来源，不引入第二套状态字段。
- 任务顺序只维护父级 `child_ids` 的数组顺序，新任务追加到末尾，让列表、任务图、Agent 读到的顺序始终一致。
- 所有顶层任务都归到根任务（`is_root`）下，新增走 `addTodo`（默认挂根），根任务本身不暴露给用户。
- 删除保留 `deleted_at` 软删除，误删可恢复。

### 验证

- 前端：`cd frontend && npm run build`；改 store 再跑 `npm test`。
- 已知噪声：`cd frontend && npm run type-check` 会因 vue-tsc 1.8 与 TS 5.9 不兼容直接崩，不作为新错误追。
- 文档：`cd docs && npm run build`；`ignoreDeadLinks` 已关闭，死链会中断构建。
- 数据库：迁移按领域拆成有序文件（表结构 / 索引 / RLS / 视图 / 函数 / 触发器 / Realtime），可直接改写既有迁移并重置。没有本机 Postgres 时用 PGlite 按时间戳顺序执行 `supabase/migrations/*.sql`；先建桩 `auth` schema、`auth.users(id uuid)`、`auth.uid()`，以及 `anon` / `authenticated` 角色。

## 维护

改动源码文件结构、命令或数据模型时，同步更新[代码地图](docs/src/content/docs/dev/code-map.md)；本文件在文档分工或项目约定变化时修改。
