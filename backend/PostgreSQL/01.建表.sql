-- 删除旧表
DROP TABLE IF EXISTS todos;

-- 建立主要工作表: todos
CREATE TABLE todos (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- 关联用户表( Supabase 内置的 auth.users )
    parent_id BIGINT REFERENCES todos(id) ON DELETE CASCADE,            -- 父任务 ID，用于构建树形结构
    title TEXT NOT NULL,                                                -- 任务标题
    description TEXT,                                                   -- 任务描述
    deadline TIMESTAMPTZ DEFAULT NULL,                                  -- 任务截止时间
    status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')), -- 任务状态
    priority INTEGER DEFAULT 0 CHECK (priority BETWEEN 0 AND 4),        -- 优先级: 0=无, 1=低, 2=中, 3=高, 4=紧急
    sort_order INTEGER DEFAULT 0,                                       -- 自定义排序顺序
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL                                -- 已删除标记
);

-- 设置 RLS 行级安全策略, 使用户只能操作自己的任务
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own todos" ON todos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own todos" ON todos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own todos" ON todos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own todos" ON todos FOR DELETE USING (auth.uid() = user_id);

-- 对最常用的查询条件建立索引, 提升查询性能
CREATE INDEX idx_todos_user_active ON todos(user_id, status) WHERE deleted_at IS NULL;  -- 仅对未删除的任务建立索引
CREATE INDEX idx_todos_parent ON todos(parent_id);                                      -- 父任务索引, 树形结构必需
CREATE INDEX idx_todos_priority ON todos(user_id, priority, deadline) WHERE deleted_at IS NULL;  -- 优先级和截止时间查询
