# TodoHeap 设计文档（SDD 草稿）

## 1. 总体架构

- 前端：Vue3 + Vite + TailwindCSS，SPA 单页应用，采用组件化开发。
- 后端：Supabase（Postgres 数据库 + Edge Functions），主要通过 RESTful API 与前端交互。
- AI 服务：通过 Supabase Edge Function 或第三方 API 调用大模型，实现任务分解等智能功能。

## 2. 主要模块划分

### 2.1 前端模块

- 页面层（pages）：Home、Login、Todo、work（Settings、TodoHeap、TodoList、TodoTree）、404
- 组件层（components）：NavBar、SideMenu、Footer、TodoListItem 等
- 布局层（layouts）：AuthLayout、DashboardLayout、DefaultLayout
- 状态管理（stores）：auth.js（用户认证）、todos.js（任务数据）
- 工具与算法（utils）：priorityCalculator.js（优先级算法）、supabaseQueries.js（数据操作）、supabaseQueriesExamples.js

### 2.2 后端模块

- 数据库：Postgres，核心表为 tasks（见 SRS 附录），支持 RLS 行级安全。
- Edge Functions：如 breakdown_task（AI 分解）、hello（测试）、_shared/cors（跨域支持）
- 迁移脚本：migrations 目录下 SQL 文件，管理表结构与视图

### 2.3 AI 分解服务

- 输入：任务描述、分解参数（最大子任务数、语言、细粒度等）
- 输出：子任务列表（含标题、描述、建议优先级、置信度等）
- 调用方式：前端发起 API 请求，后端函数转发到大模型服务，处理结果写入数据库

## 3. 关键流程

### 3.1 用户注册与登录

1. 前端通过 Supabase Auth API 注册/登录
2. 获取 JWT，存储于本地
3. 后续所有 API 请求带上认证信息

### 3.2 任务 CRUD

1. 用户在前端页面操作（新建、编辑、删除、完成任务）
2. 前端调用 supabase.js 封装的 API，与后端数据库交互
3. 状态变更后自动刷新任务堆展示

### 3.3 任务堆展示与优先级计算

1. 前端从数据库拉取所有任务
2. 使用 priorityCalculator.js 计算每个任务的优先级分数
3. 以堆结构（优先队列）展示，堆顶为当前最优先任务

### 3.4 AI 任务分解

1. 用户点击“AI 分解”按钮
2. 前端调用 /api/tasks/:id/ai-split
3. 后端函数调用大模型，返回子任务列表
4. 子任务写入数据库，前端自动刷新

## 4. 关键接口设计

- 见 SRS 附录 REST API 规范
- 主要接口包括：用户注册/登录、任务 CRUD、AI 分解、批量操作、筛选与搜索

## 5. 数据安全与权限

- 所有任务数据通过 user_id 进行隔离
- Supabase RLS 策略确保用户只能访问自己的数据
- Edge Functions 仅允许认证用户调用

## 6. 技术选型说明

- 前端：Vue3（响应式、生态丰富）、Vite（极速开发）、TailwindCSS（高效样式）
- 后端：Supabase（开箱即用的云数据库+认证+函数）、Postgres（强大关系型数据库）
- AI：可接入 OpenAI、Azure OpenAI、百度文心等大模型服务，支持多云切换

## 7. 部署与运维

- 前端：GitHub Actions 自动部署到 GitHub Pages
- 后端：Supabase 云端托管，自动化迁移与函数部署
- 文档：docs/ 目录下 markdown 文件，mkdocs 自动构建

## 8. 可扩展性与未来规划

- 支持团队协作、任务共享
- 日历与甘特图视图
- 更丰富的 AI 辅助功能（如智能提醒、自动归档）
- 插件化算法与自定义视图

---

如需进一步细化某一部分（如数据库 E-R 图、API 详细参数、前端组件树等），可随时补充。
# 设计文档

