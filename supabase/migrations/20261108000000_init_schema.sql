-- TodoHeap 数据库基线: 在全新数据库上一次建齐所需结构
-- 历史迁移已合并到本文件; 后续结构变更请新增迁移, 不再修改本文件

-- ---------------------------------------------------------------------------
-- 表
-- ---------------------------------------------------------------------------

-- 任务表: 树形结构, 软删除
CREATE TABLE todos (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id BIGINT REFERENCES todos(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMPTZ DEFAULT NULL,
    deadline TIMESTAMPTZ DEFAULT NULL,
    difficulty DECIMAL(5,2) DEFAULT NULL,                                  -- 工时
    status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
    priority INTEGER DEFAULT 0 CHECK (priority BETWEEN 0 AND 4),          -- 0=无 1=低 2=中 3=高 4=紧急
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- 用户设置表: 每个用户一行 JSONB 偏好
CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE user_settings IS '用户个性化设置表';
COMMENT ON COLUMN user_settings.settings IS '存储用户设置的 JSON 对象，如 {"autoApplyAITasks": false}';

-- 日程表: 独立日历事件, 可选关联任务
CREATE TABLE schedules (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    todo_id BIGINT REFERENCES todos(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    notes TEXT,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'done', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT schedules_time_range CHECK (end_at > start_at)
);

COMMENT ON TABLE schedules IS '日程表: 独立日历事件，可关联任务';

-- ---------------------------------------------------------------------------
-- 索引: 覆盖最常用的用户维度、父子维度与时间范围查询
-- ---------------------------------------------------------------------------

CREATE INDEX idx_todos_user_active ON todos(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_todos_user_parent ON todos(user_id, parent_id);
CREATE INDEX idx_todos_priority ON todos(user_id, priority, deadline) WHERE deleted_at IS NULL;

CREATE INDEX idx_schedules_user_range ON schedules(user_id, start_at);
CREATE INDEX idx_schedules_todo ON schedules(todo_id) WHERE todo_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 行级安全: 用户只能读写自己的数据
-- ---------------------------------------------------------------------------

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own todos" ON todos FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own todos" ON todos FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own todos" ON todos FOR UPDATE USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete own todos" ON todos FOR DELETE USING (user_id = (SELECT auth.uid()));

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own settings" ON user_settings FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own settings" ON user_settings FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own settings" ON user_settings FOR UPDATE USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete own settings" ON user_settings FOR DELETE USING (user_id = (SELECT auth.uid()));

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own schedules" ON schedules FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own schedules" ON schedules FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own schedules" ON schedules FOR UPDATE USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete own schedules" ON schedules FOR DELETE USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 视图: 为堆视图与回收站提供简化查询; security_invoker 保证继承行级安全
-- ---------------------------------------------------------------------------

-- 叶子任务: 没有子任务的未删除任务
CREATE VIEW leaf_todos WITH (security_invoker = on) AS
SELECT * FROM todos t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM todos c WHERE c.parent_id = t.id);

-- 回收站: 已删除任务, 附叶子标记与子任务数量
CREATE VIEW trash_todos WITH (security_invoker = on) AS
SELECT
    t.*,
    NOT EXISTS (
        SELECT 1 FROM todos c
        WHERE c.parent_id = t.id AND c.deleted_at IS NULL
    ) AS is_leaf,
    (SELECT COUNT(*) FROM todos c WHERE c.parent_id = t.id) AS child_count
FROM todos t
WHERE t.deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 函数与触发器
-- ---------------------------------------------------------------------------

-- 通用: 更新前刷新 updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 软删除传播: 父任务删除或还原时同步全部子孙任务
CREATE OR REPLACE FUNCTION public.todos_propagate_deleted_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- 软删除: NULL -> 非 NULL
        IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
            WITH RECURSIVE descendants AS (
                SELECT id FROM todos WHERE parent_id = NEW.id
                UNION ALL
                SELECT t.id FROM todos t JOIN descendants d ON t.parent_id = d.id
            )
            UPDATE todos
            SET deleted_at = NEW.deleted_at, updated_at = NOW()
            WHERE id IN (SELECT id FROM descendants) AND deleted_at IS DISTINCT FROM NEW.deleted_at;

        -- 还原: 非 NULL -> NULL
        ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
            WITH RECURSIVE descendants AS (
                SELECT id FROM todos WHERE parent_id = NEW.id
                UNION ALL
                SELECT t.id FROM todos t JOIN descendants d ON t.parent_id = d.id
            )
            UPDATE todos
            SET deleted_at = NULL, updated_at = NOW()
            WHERE id IN (SELECT id FROM descendants) AND deleted_at IS NOT NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- RPC: 删除当前登录账号, 其余数据由外键级联清理
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id uuid;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    DELETE FROM auth.users WHERE id = current_user_id;

    RETURN FOUND;
END;
$$;

CREATE TRIGGER trg_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_todos_propagate_deleted_at
    AFTER UPDATE OF deleted_at ON todos
    FOR EACH ROW EXECUTE FUNCTION public.todos_propagate_deleted_at();

-- ---------------------------------------------------------------------------
-- Realtime: 变更携带完整旧记录, 便于按 user_id 过滤
-- ---------------------------------------------------------------------------

ALTER TABLE todos REPLICA IDENTITY FULL;
ALTER TABLE schedules REPLICA IDENTITY FULL;

DO $$
DECLARE
    tbl text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    FOREACH tbl IN ARRAY ARRAY['todos', 'schedules'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
        END IF;
    END LOOP;
END $$;
