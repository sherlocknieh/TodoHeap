-- 备份旧表数据
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'todos') THEN
        -- 创建临时备份表
        CREATE TEMP TABLE todos_backup AS SELECT * FROM todos;
        RAISE NOTICE '已备份 % 条记录', (SELECT COUNT(*) FROM todos_backup);
    END IF;
END $$;

-- 删除旧表
DROP TABLE IF EXISTS todos CASCADE;

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
CREATE POLICY "Users can view own todos" ON todos FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own todos" ON todos FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own todos" ON todos FOR UPDATE USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete own todos" ON todos FOR DELETE USING (user_id = (SELECT auth.uid()));

-- 对最常用的查询条件建立索引, 提升查询性能
CREATE INDEX idx_todos_user_active ON todos(user_id, status) WHERE deleted_at IS NULL;  -- 仅对未删除的任务建立索引
CREATE INDEX idx_todos_user_parent ON todos(user_id, parent_id);                        -- 父任务查询索引
CREATE INDEX idx_todos_priority ON todos(user_id, priority, deadline) WHERE deleted_at IS NULL;  -- 优先级和截止时间查询索引


-- 还原备份数据
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'pg_temp_1' AND tablename LIKE 'todos_backup%') 
       OR EXISTS (SELECT FROM pg_tables WHERE tablename = 'todos_backup') THEN
        -- 还原数据到新表
        INSERT INTO todos (id, user_id, parent_id, title, description, deadline, status, priority, sort_order, created_at, updated_at, deleted_at)
        SELECT id, user_id, parent_id, title, description, deadline, status, priority, sort_order, created_at, updated_at, deleted_at
        FROM todos_backup
        ON CONFLICT (id) DO NOTHING;
        
        -- 更新序列值，确保新插入的记录 ID 不会冲突
        PERFORM setval('todos_id_seq', COALESCE((SELECT MAX(id) FROM todos), 0) + 1, false);
        
        RAISE NOTICE '已还原 % 条记录', (SELECT COUNT(*) FROM todos);
    END IF;
END $$;