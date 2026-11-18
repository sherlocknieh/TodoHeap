# TodoHeap 项目索引

> 本文件只做导航：**完整索引已迁到 [docs/zh/dev/04.code-map.md](docs/zh/dev/04.code-map.md)**。开工先读那一页，再按需打开具体文件，不要为了了解结构而全量阅读源码。

AI 辅助的任务管理应用：Vue 3 前端 + Supabase（Postgres / Auth / Realtime / Edge Functions）。仓库含三个可独立安装的子项目：`frontend/`、`docs/`、`supabase/`。

## 文档分工

| 要知道什么 | 去哪里 |
| --- | --- |
| 目录地图、常用命令、文件职责、状态管理与 Supabase 结构 | [代码地图](docs/zh/dev/04.code-map.md) |
| 用户对界面的说法 → 代码位置 | [关键词索引](docs/zh/dev/keyword-index.md) |
| 机制与链路（为什么这样写、约束、如何验证） | [逻辑文档](docs/zh/dev/logic/index.md) |
| 产品目标与完整闭环 | [项目愿景与方案](docs/zh/dev/00.goals.md) |
| 系统设计、技术选型、数据库设计 | [架构与技术栈](docs/zh/dev/02.architecture.md) |
| 开发流程与常见任务 | [开发流程与任务](docs/zh/dev/03.development.md) |
| 按功能域记录当前实现 | [特性记录](docs/zh/features/index.md) |

## 开工流程

开工前加载 `dev-init` skill（全局 `dev` 分组），按「定位 → 核对约定 → 实现 → 验证 → 记录 → 提交」走。本仓库的 UI、数据模型、文档记录与验证细则在该 skill 的 `references/todoheap.md`。

## 维护

改动源码文件结构、命令或数据模型时，同步更新[代码地图](docs/zh/dev/04.code-map.md)；本文件只在文档分工变化时修改。
