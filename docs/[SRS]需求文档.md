
# TodoHeap 需求文档


## 核心目标

开发一个基于堆结构展示任务的任务管理应用，利用 AI 技术自动分解复杂任务，提升用户的任务管理效率和体验。


## 功能需求

### P0 级（核心功能，必须实现）

- 任务管理：创建、编辑、删除、完成任务。
- 任务字段：标题、描述、优先级、截止时间、标签、状态（待办/进行中/已完成）。
- 任务堆展示：以堆结构（优先队列）自动展示最优先任务，无需手动排序。
- AI 任务分解：对单个任务发起“AI 自动分解”，AI 拆分为子任务，子任务自动加入任务列表。
- 用户认证：注册、登录、登出，用户数据隔离。
- 数据存储与同步：基于 Supabase 云端存储，前后端数据同步。

### P1 级（重要功能，优先实现）

- 任务分解结果可编辑、合并、删除。
- 任务批量操作（如批量完成、删除）。
- 任务优先级算法可配置（如截止时间、紧急程度、重要性等），支持自定义权重。
- 任务搜索与筛选（按标签、状态、优先级等）。
- 前端自适应桌面端和移动端。
- 任务历史记录与恢复。

### P2 级（增强功能，后续迭代）

- 支持第三方登录（如 GitHub、Google）。
- 支持 PWA（渐进式 Web 应用）。
- 支持本地缓存与离线模式。
- 通知提醒（如任务即将到期）。
- 管理员功能：管理用户、监控系统运行。


## 技术约束

- 前端目录：frontend/src
- 后端函数目录：supabase/functions
- 数据库迁移脚本目录：supabase/migrations
- 文档目录：docs/
- 依赖管理：Node.js（前端）、requirements.txt（文档自动构建）

## 交互流程（简要）

1. 用户注册/登录。
2. 进入主界面，查看任务堆，自动显示最优先任务。
3. 用户可新建任务、编辑、删除、完成任务。
4. 对复杂任务可一键 AI 分解，生成子任务。
5. 所有操作实时同步到云端，支持多端访问。

## 未来扩展（可选）

- 团队协作与任务共享。
- 日历视图与甘特图。
- 更丰富的 AI 辅助功能（如智能提醒、自动归档等）。

## 设计规范

- 界面简洁直观，符合现代 UI/UX 设计原则。
- 代码遵循统一的编码规范，注重可读性和可维护性

## 交付要求

- 完整的源代码，包含前端和后端。
- 部署文档，指导如何在本地和云端部署应用。
- 用户手册，介绍应用的主要功能和使用方法。


## 用户体验需求


## 附录：开发交付片段（可直接复制到实现文档）

下面的片段旨在快速让开发与 AI 消费方使用：包括数据库表草案、REST API 示例、AI 分解输入/输出结构、核心功能的验收标准与基础测试用例。

### A. 数据模型（示例：`tasks` 表）

```sql
-- tasks 表（Postgres / Supabase）
CREATE TABLE tasks (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL,
	parent_id uuid NULL, -- 父任务 id（若为子任务）
	title text NOT NULL,
	description text,
	priority integer DEFAULT 0,
	due_date timestamptz NULL,
	status varchar(32) NOT NULL DEFAULT 'todo', -- todo|in_progress|done
	tags text[] DEFAULT '{}',
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now()
);
CREATE INDEX ON tasks (user_id);
CREATE INDEX ON tasks (priority DESC);
CREATE INDEX ON tasks (due_date);
```

字段说明：`priority` 为系统或 AI 建议的数值；`parent_id` 用于表示分解后的子任务关系。

### B. REST API 示例（简要）

- POST /api/auth/signup  注册
- POST /api/auth/login   登录
- GET  /api/tasks?limit=20&page=1&filter=...  获取任务（支持分页、过滤）
- POST /api/tasks  创建任务（请求体见下）
- PATCH /api/tasks/:id  更新任务
- DELETE /api/tasks/:id 删除任务
- POST /api/tasks/:id/ai-split  请求 AI 分解

示例：创建任务请求体（JSON）

```json
{
	"title": "重构用户认证模块",
	"description": "将旧的 OAuth 实现迁移到 Supabase Auth",
	"priority": 5,
	"due_date": "2026-01-10T12:00:00Z",
	"tags": ["backend","auth"]
}
```

成功响应（201）示例：

```json
{
	"id": "...",
	"user_id": "...",
	"title": "...",
	"status": "todo",
	"created_at": "..."
}
```

### C. AI 分解接口规范（JSON）

请求（POST /api/tasks/:id/ai-split）

```json
{
	"task_id": "<uuid>",
	"prompt_options": {
		"max_subtasks": 8,
		"language": "zh-CN",
		"detail_level": "medium"  // low|medium|high
	}
}
```

AI 返回结构（成功）

```json
{
	"task_id": "<uuid>",
	"subtasks": [
		{
			"title": "子任务标题",
			"description": "可选描述",
			"suggested_priority": 4,
			"estimated_minutes": 90,
			"confidence": 0.86
		}
	],
	"meta": {"model":"gpt-xxx","prompt":"..."}
}
```

失败回退策略：若 AI 返回空结果或 confidence 均低于 0.4，则返回 202 Accepted 与人工审阅提示；不直接创建子任务。

### D. 核心功能验收标准（示例）

- 创建任务（P0）
	- 请求包含 `title`（非空），服务返回 201 和任务对象。
	- 数据库存储 `user_id`，`status` 默认为 `todo`。

- AI 分解（P0）
	- 发起分解后若 AI 返回有效 `subtasks`（至少1项且 confidence>=0.4），系统在数据库创建对应子任务并将 `parent_id` 指向原任务；返回 200 与创建子任务列表。
	- 若 AI 未返回有效结果，返回 202 并在 UI 显示 "待人工审阅"。

### E. 优先级计算示例

示例得分公式（后端可配置）：

$$
score = w_{due} * \frac{1}{days\_to\_due + 1} + w_{priority} * normalized(importance) + w_{recency} * recencyScore
$$

默认权重示例：`w_due=0.5, w_priority=0.4, w_recency=0.1`。归一化与具体实现留后端配置。

### F. 安全与日志建议

- 使用 Supabase RLS (Row-Level Security) 确保 `user_id` 可见性限制。
- 不在持久化日志中保存完整任务描述的敏感内容；AI 请求日志需做脱敏或只保存摘要与 hash。

### G. 测试用例样例

- 单元：创建任务时缺少 title -> 返回 400；title 合法 -> 写入 DB。
- 集成：触发 AI 分解（模拟 AI 返回）-> 子任务正确创建且 parent_id 设置。
- E2E：登录 -> 创建任务 -> AI 分解 -> 编辑子任务 -> 标记完成。

---

我已把以上可复制片段追加到文档末尾，便于开发快速消费与 AI 训练。如需我把其中部分拆为独立 `docs` 文件（例如 `api.md`、`data-model.md` 或 `ai-spec.md`），我可以继续创建并分拆。
