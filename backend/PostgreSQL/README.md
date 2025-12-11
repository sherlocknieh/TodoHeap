# TodoHeap 数据库 SQL 脚本

## 文件说明

数据库脚本已按功能模块拆分为多个文件:

### 核心文件

- **`00_setup_all.sql`** - 主安装脚本,按顺序执行所有 SQL 文件
- **`01_create_table.sql`** - 创建 `todos` 表结构
- **`02_rls_policies.sql`** - 配置行级安全策略 (RLS)
- **`03_indexes.sql`** - 创建性能优化索引
- **`04_triggers.sql`** - 创建触发器和触发器函数
- **`05_views.sql`** - 创建视图
- **`06_functions.sql`** - 创建自定义函数

### 旧文件

- **`Create Table Todos.sql`** - 原始完整脚本(已弃用,保留作为参考)

## 安装方式

### 方式 1: 使用主安装脚本 (推荐)

```bash
psql -U your_username -d your_database -f 00_setup_all.sql
```

### 方式 2: 在 Supabase Dashboard 中执行

在 Supabase 的 SQL Editor 中依次执行以下文件:

1. `01_create_table.sql`
2. `02_rls_policies.sql`
3. `03_indexes.sql`
4. `04_triggers.sql`
5. `05_views.sql`
6. `06_functions.sql`

### 方式 3: 单独执行

```bash
psql -U your_username -d your_database -f 01_create_table.sql
psql -U your_username -d your_database -f 02_rls_policies.sql
psql -U your_username -d your_database -f 03_indexes.sql
psql -U your_username -d your_database -f 04_triggers.sql
psql -U your_username -d your_database -f 05_views.sql
psql -U your_username -d your_database -f 06_functions.sql
```

## 功能说明

### 表结构 (01_create_table.sql)

- 任务基本信息: 标题、描述、截止时间
- 任务分类: 优先级、标签数组
- 工时管理: 预计工时、实际工时
- 树形结构: parent_id 支持任务层级
- 软删除: deleted_at 字段

### RLS 策略 (02_rls_policies.sql)

- 用户只能查看/操作自己的任务
- 基于 Supabase auth.uid() 实现

### 索引 (03_indexes.sql)

- 用户+状态复合索引
- 父任务索引 (树形结构)
- 优先级+截止时间索引
- 标签 GIN 索引
- 自定义排序索引

### 触发器 (04_triggers.sql)

1. **自动更新时间戳** - 更新时自动设置 `updated_at`
2. **防止循环引用** - 防止任务父子关系形成环
3. **软删除级联** - 删除父任务时级联删除子任务
4. **验证截止时间** - 确保截止时间逻辑正确
5. **自动更新父任务状态** - 根据子任务状态更新父任务

### 视图 (05_views.sql)

- `active_todos` - 未删除的任务
- `todos_with_children` - 任务+子任务统计
- `root_todos` - 根任务(无父任务)
- `upcoming_todos` - 即将到期的任务(7天内)
- `overdue_todos` - 已过期的任务

### 函数 (06_functions.sql)

- `get_all_descendants(task_id)` - 获取所有子孙任务
- `get_all_ancestors(task_id)` - 获取所有祖先任务
- `calculate_progress(task_id)` - 计算完成进度百分比

## 注意事项

1. 确保已安装 PostgreSQL 或使用 Supabase
2. 确保有 `auth.users` 表 (Supabase 自带)
3. 按顺序执行脚本,避免依赖问题
4. 生产环境建议先在测试环境验证

## 卸载

```sql
DROP TABLE IF EXISTS todos CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
DROP FUNCTION IF EXISTS prevent_circular_reference CASCADE;
DROP FUNCTION IF EXISTS cascade_soft_delete CASCADE;
DROP FUNCTION IF EXISTS validate_deadline CASCADE;
DROP FUNCTION IF EXISTS update_parent_status CASCADE;
DROP FUNCTION IF EXISTS get_all_descendants CASCADE;
DROP FUNCTION IF EXISTS get_all_ancestors CASCADE;
DROP FUNCTION IF EXISTS calculate_progress CASCADE;
```
