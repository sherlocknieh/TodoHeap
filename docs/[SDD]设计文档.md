# 设计文档

## 1. 系统架构

### 1.1 总体架构

TodoHeap 采用前后端分离架构，前端为单页应用（SPA），后端基于 Supabase 云平台。

**前端架构：**
- 框架：Vue 3（Composition API）
- 构建工具：Vite
- 路由：Vue Router（Hash 模式）
- 状态管理：Pinia
- 样式：TailwindCSS
- UI 组件：自定义组件库

**后端架构：**
- 数据库：PostgreSQL（Supabase 托管）
- 认证：Supabase Auth（JWT）
- API：Supabase REST API + Edge Functions
- 存储：Supabase Storage（如需要）

**AI 服务：**
- 任务分解：Supabase Edge Function + OpenAI API
- 模型支持：可配置（默认 deepseek-chat）

### 1.2 技术栈选型理由

| 技术 | 选型理由 |
|------|---------|
| Vue 3 | 响应式系统成熟，Composition API 便于逻辑复用，生态丰富 |
| Vite | 开发构建速度快，HMR 体验好，支持现代 ES 模块 |
| Pinia | Vue 3 官方推荐状态管理，类型支持好，轻量级 |
| TailwindCSS | 原子化 CSS，开发效率高，样式一致性好 |
| Supabase | 开箱即用的 BaaS，PostgreSQL + Auth + Functions 一体化 |
| PostgreSQL | 关系型数据库，支持复杂查询和事务，RLS 安全策略 |

## 2. 系统模块设计

### 2.1 前端模块结构

```
frontend/src/
├── pages/              # 页面组件
│   ├── Home.vue       # 首页（产品介绍）
│   ├── Login.vue      # 登录/注册页
│   ├── Todo.vue       # 主应用页（路由容器）
│   ├── 404.vue        # 404 错误页
│   └── todo/          # 工作页面
│       ├── TodoList.vue    # 列表视图
│       ├── TodoTree.vue    # 树视图（思维导图）
│       ├── TodoHeap.vue    # 堆视图（优先级排序）
│       └── Settings.vue    # 设置页
├── components/        # 通用组件
│   ├── NavBar.vue     # 导航栏
│   ├── Footer.vue     # 页脚
│   ├── SideMenu.vue   # 侧边栏菜单
│   └── TodoListItem.vue  # 任务列表项
├── layouts/           # 布局组件
│   ├── DefaultLayout.vue    # 默认布局
│   ├── AuthLayout.vue        # 认证页布局
│   └── DashboardLayout.vue  # 仪表盘布局
├── stores/            # 状态管理
│   ├── auth.js        # 认证状态（用户信息、登录状态）
│   └── todos.js       # 任务状态（CRUD、AI 分解）
├── utils/             # 工具函数
│   ├── priorityCalculator.js  # 优先级计算算法
│   ├── supabaseQueries.js      # Supabase 查询封装
│   └── supabaseQueriesExamples.js  # 查询示例
├── router.js          # 路由配置
├── supabase.js        # Supabase 客户端初始化
├── main.js            # 应用入口
└── style.css          # 全局样式
```

### 2.2 后端模块结构

```
supabase/
├── migrations/        # 数据库迁移脚本
│   ├── 20251212040000_create_todos_table.sql  # 创建任务表
│   ├── 20251212040500_create_views.sql         # 创建视图
│   └── 20251212060000_add_columns.sql          # 添加列
├── functions/         # Edge Functions
│   ├── breakdown_task/    # AI 任务分解函数
│   │   └── index.ts
│   ├── hello/             # 测试函数
│   │   └── index.ts
│   └── _shared/           # 共享代码
│       └── cors.ts        # CORS 配置
└── config.toml        # Supabase 配置
```

### 2.3 数据库设计

#### 2.3.1 核心表结构

**todos 表：**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 任务 ID |
| user_id | UUID | NOT NULL, FK → auth.users | 用户 ID |
| parent_id | BIGINT | FK → todos.id | 父任务 ID（树形结构） |
| title | TEXT | NOT NULL | 任务标题 |
| description | TEXT | NULL | 任务描述 |
| deadline | TIMESTAMPTZ | NULL | 截止时间 |
| status | TEXT | DEFAULT 'todo', CHECK | 状态：todo/doing/done |
| priority | INTEGER | DEFAULT 0, CHECK(0-4) | 优先级：0=无,1=低,2=中,3=高,4=紧急 |
| sort_order | INTEGER | DEFAULT 0 | 自定义排序 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新时间 |
| deleted_at | TIMESTAMPTZ | NULL | 软删除标记 |

#### 2.3.2 索引设计

```sql
-- 用户活跃任务查询索引
CREATE INDEX idx_todos_user_active ON todos(user_id, status) 
WHERE deleted_at IS NULL;

-- 父任务查询索引
CREATE INDEX idx_todos_user_parent ON todos(user_id, parent_id);

-- 优先级和截止时间查询索引
CREATE INDEX idx_todos_priority ON todos(user_id, priority, deadline) 
WHERE deleted_at IS NULL;
```

#### 2.3.3 视图设计

- `active_todos`：活跃任务视图（排除已删除）
- `leaf_todos`：叶子任务视图（无子任务）
- `root_todos`：根任务视图（无父任务）
- `v_todos_tree`：任务树视图（递归 CTE）
- `v_todos_with_progress`：带进度的任务视图（计算子任务完成度）

#### 2.3.4 安全策略（RLS）

```sql
-- 启用行级安全
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的任务
CREATE POLICY "Users can view own todos" 
ON todos FOR SELECT 
USING (user_id = auth.uid());

-- 用户只能插入自己的任务
CREATE POLICY "Users can insert own todos" 
ON todos FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- 用户只能更新自己的任务
CREATE POLICY "Users can update own todos" 
ON todos FOR UPDATE 
USING (user_id = auth.uid());

-- 用户只能删除自己的任务
CREATE POLICY "Users can delete own todos" 
ON todos FOR DELETE 
USING (user_id = auth.uid());
```

## 3. 核心功能设计

### 3.1 用户认证流程

1. **注册流程：**
   - 用户输入邮箱和密码（至少 6 字符）
   - 前端调用 `supabase.auth.signUp()`
   - Supabase 发送验证邮件（如启用）
   - 注册成功后自动登录

2. **登录流程：**
   - 用户输入邮箱和密码
   - 前端调用 `supabase.auth.signInWithPassword()`
   - 获取 JWT Token 存储于本地
   - 跳转到应用页面

3. **认证状态管理：**
   - Pinia store (`auth.js`) 管理用户状态
   - 路由守卫检查 `requiresAuth` meta
   - 未认证用户访问受保护路由时重定向到登录页

### 3.2 任务 CRUD 流程

**创建任务：**
1. 用户在前端输入任务信息（标题、优先级、截止日期）
2. 前端调用 `todos.js` store 的 `addTodo()` 方法
3. Store 调用 Supabase API：`supabase.from('todos').insert()`
4. 数据库插入记录，返回新任务数据
5. Store 更新本地状态，UI 自动刷新

**读取任务：**
1. 页面加载时调用 `fetchTodos()`
2. 查询条件：`user_id = auth.uid()` 且 `deleted_at IS NULL`
3. 按优先级和 ID 排序返回
4. 结果存储到 Pinia store

**更新任务：**
1. 用户编辑任务信息
2. 调用 `updateTodo(id, updates)`
3. Supabase API：`supabase.from('todos').update().eq('id', id)`
4. 更新本地状态

**删除任务：**
1. 软删除：设置 `deleted_at = NOW()`
2. 硬删除：调用 `deleteTodo(id)`
3. 删除父任务时，子任务级联删除（数据库 CASCADE）

### 3.3 优先级计算算法

优先级计算器 (`priorityCalculator.js`) 基于多维度综合评分：

**计算公式：**
```
finalScore = baseScore × 100 + urgencyScore × 30 + progressScore × 20 + complexityScore × 10 + statusScore × 5
```

**维度说明：**

1. **基础优先级 (baseScore)**：用户手动设置
   - 0 → 0.25（低）
   - 1 → 0.50（中）
   - 2 → 0.75（高）
   - 3 → 1.0（紧急）

2. **紧急度 (urgencyScore)**：基于截止日期
   - 无截止日期 → 0
   - 已过期 → 1.0
   - 距离截止天数 ≤ 1 → 0.9
   - 距离截止天数 ≤ 3 → 0.7
   - 距离截止天数 ≤ 7 → 0.5
   - 其他 → 0.3

3. **完成度 (progressScore)**：子任务完成比例
   - 完成度越高，优先级越低（已完成的任务不需要优先处理）
   - 公式：`1 - (progress / 100)`

4. **复杂度 (complexityScore)**：子任务数量
   - 子任务越多，优先级越高（复杂任务需要更多时间）
   - 公式：`min(childCount / 10, 1.0)`

5. **状态 (statusScore)**：任务当前状态
   - doing → 1.0（进行中最高）
   - todo → 0.7（待办中等）
   - done → 0（已完成最低）

**堆结构排序：**
- 使用大顶堆（Max Heap）数据结构
- 优先级分数最高的任务在堆顶
- 支持动态更新和重新排序

### 3.4 AI 任务分解流程

**API 端点：** `POST /functions/v1/breakdown_task`

**请求体：**
```typescript
{
  todosTree: TreeNode | TreeNode[],  // 完整任务树
  selectedNodeId: number,            // 要分解的任务 ID
  query: string                      // 用户分解指令
}
```

**处理流程：**
1. Edge Function 接收请求，验证参数
2. 从任务树中提取目标任务及其上下文
3. 构建提示词：
   - System Prompt：定义输出格式（JSON）
   - Context：完整任务树结构
   - Goal Task：目标任务详情
   - User Query：用户分解指令
4. 调用 OpenAI API（可配置模型和 API Key）
5. 解析 AI 响应为 JSON 格式
6. 验证子任务数据结构
7. 返回子任务列表

**响应格式：**
```json
{
  "children": [
    {
      "title": "子任务标题",
      "status": "todo",
      "priority": 1
    }
  ]
}
```

**前端处理：**
1. 接收子任务列表
2. 遍历创建子任务记录
3. 设置 `parent_id` 为选中任务 ID
4. 批量插入数据库
5. 刷新任务树显示

### 3.5 视图模式设计

**列表视图（TodoList）：**
- 扁平化展示所有任务
- 支持层级缩进显示父子关系
- 实时搜索和筛选
- 快速添加和编辑

**树视图（TodoTree）：**
- 使用 `simple-mind-map` 库渲染思维导图
- 支持节点拖拽创建子任务
- 点击节点编辑标题
- 自动保存视图状态（缩放、位置）

**堆视图（TodoHeap）：**
- 可视化堆数据结构
- SVG 绘制节点和连接线
- 显示优先级分数
- 列表形式展示排序结果

## 4. 接口设计

### 4.1 Supabase REST API

**认证：** 所有请求需携带 JWT Token（Header: `Authorization: Bearer <token>`）

**任务相关接口：**

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/rest/v1/todos` | 获取任务列表 |
| POST | `/rest/v1/todos` | 创建任务 |
| PATCH | `/rest/v1/todos?id=eq.{id}` | 更新任务 |
| DELETE | `/rest/v1/todos?id=eq.{id}` | 删除任务 |

**查询参数：**
- `select`: 选择字段（如 `select=id,title,status`）
- `eq`: 等于（如 `eq.user_id`）
- `neq`: 不等于（如 `neq.status,deleted`）
- `order`: 排序（如 `order=priority.desc,id.asc`）
- `limit`: 限制数量

### 4.2 Edge Functions API

**任务分解接口：**
- **端点：** `/functions/v1/breakdown_task`
- **方法：** POST
- **认证：** Bearer Token
- **请求体：** 见 3.4 节
- **响应：** JSON 格式子任务列表

## 5. 数据安全

### 5.1 认证安全
- JWT Token 存储在浏览器 localStorage
- Token 自动过期机制
- 路由守卫防止未授权访问

### 5.2 数据隔离
- 行级安全策略（RLS）确保用户只能访问自己的数据
- 所有数据库查询自动添加 `user_id` 过滤条件
- Edge Functions 验证用户身份

### 5.3 输入验证
- 前端表单验证（邮箱格式、密码长度）
- 后端参数验证（Edge Functions）
- SQL 注入防护（Supabase 参数化查询）

## 6. 性能优化

### 6.1 前端优化
- 组件懒加载（路由级别）
- 虚拟滚动（如任务列表过长）
- 防抖搜索（减少 API 调用）
- 本地状态缓存（减少重复请求）

### 6.2 数据库优化
- 索引优化（见 2.3.2 节）
- 查询条件优化（使用 WHERE 子句过滤）
- 视图预计算（进度、树结构）
- 软删除避免数据丢失

### 6.3 API 优化
- 批量操作支持
- 分页查询（如需要）
- 响应缓存（如适用）

## 7. 部署架构

### 7.1 前端部署
- **平台：** GitHub Pages
- **构建：** Vite 生产构建
- **CI/CD：** GitHub Actions 自动部署
- **访问：** https://sherlocknieh.github.io/TodoHeap/

### 7.2 后端部署
- **平台：** Supabase Cloud
- **数据库：** PostgreSQL（托管）
- **Functions：** Deno Edge Functions
- **迁移：** 自动执行 migrations

### 7.3 文档部署
- **平台：** GitHub Pages
- **工具：** MkDocs + Material 主题
- **源文件：** `docs/` 目录
- **访问：** https://sherlocknieh.github.io/TodoHeap/docs/

## 8. 扩展性设计

### 8.1 功能扩展
- **团队协作：** 添加 `team_id` 字段，支持任务共享
- **标签系统：** 新增 `tags` 表，多对多关系
- **附件支持：** 集成 Supabase Storage
- **日历视图：** 基于截止日期的时间线展示
- **甘特图：** 任务依赖关系可视化

### 8.2 算法扩展
- **自定义优先级算法：** 插件化设计，支持用户自定义权重
- **智能提醒：** 基于任务优先级和截止日期的提醒策略
- **自动归档：** 完成时间超过阈值的任务自动归档

### 8.3 技术扩展
- **离线支持：** Service Worker + IndexedDB
- **移动端适配：** PWA 支持
- **国际化：** i18n 多语言支持
- **主题定制：** 用户自定义主题色

---

**文档版本：** 1.0  
**最后更新：** 2025年12月
