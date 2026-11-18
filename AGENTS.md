# TodoHeap 项目索引

> 本文件只做导航：**完整索引已迁到 [docs/src/content/docs/dev/code-map.md](docs/src/content/docs/dev/code-map.md)**。开工先读那一页，再按需打开具体文件，不要为了了解结构而全量阅读源码。

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

- **OpenCode**：开工前加载 `dev-init` skill（全局 `dev` 分组），代码与 UI、数据模型、记录、验证的细则在其 `references/todoheap.md`。
- **Copilot**：分组目录里的 skill 由 `~/.config/opencode/sync-skills.sh` 按脚本内白名单链接到 `~/.agents/skills` 后即可发现，开工前同样加载 `dev-init`；定位用的仓库文档见[代码地图](docs/src/content/docs/dev/code-map.md)、[架构与技术栈](docs/src/content/docs/dev/architecture.md)、[关键词索引](docs/src/content/docs/dev/keyword-index.md)，验证要求见本文件下文。

改完代码只用单测、构建、类型检查验证；
不要自行启动浏览器进行调试，必须先问用户。

## 维护

改动源码文件结构、命令或数据模型时，同步更新[代码地图](docs/src/content/docs/dev/code-map.md)；本文件只在文档分工变化时修改。
