-- TodoHeap 数据库基线: 表结构
-- 重置数据库后按时间戳顺序执行; 本文件只负责建表, 索引/RLS/视图/函数/触发器分别在各文件中

-- ---------------------------------------------------------------------------
-- 任务表
-- ---------------------------------------------------------------------------

-- 树形任务, 软删除; child_ids 是唯一的父子关系来源, 多父与环都是合法数据
CREATE TABLE todos (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    child_ids BIGINT[] NOT NULL DEFAULT '{}',
    title TEXT NOT NULL,
    details TEXT,
    deadline TIMESTAMPTZ DEFAULT NULL,
    sort_order INTEGER DEFAULT 0,           -- 手动排序序号
    difficulty DECIMAL(5,2) DEFAULT NULL,   -- 任务难度, 按工时估计
    completed_at TIMESTAMPTZ DEFAULT NULL,  -- 完成时间, 非空表示已完成
    external_id TEXT DEFAULT NULL,          -- 外部系统来源标识, 形如 ticktick:<task id>
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

COMMENT ON COLUMN todos.external_id IS '外部系统来源标识, 形如 ticktick:<task id>; 手工创建的任务保持 NULL';

-- ---------------------------------------------------------------------------
-- 用户设置表
-- ---------------------------------------------------------------------------

-- 每个用户一行 JSONB 偏好
CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE user_settings IS '用户个性化设置表';
COMMENT ON COLUMN user_settings.settings IS '存储用户设置的 JSON 对象，如 {"autoApplyAITasks": false}';

-- ---------------------------------------------------------------------------
-- 日程表
-- ---------------------------------------------------------------------------

-- 独立日历事件, 可选关联任务
CREATE TABLE schedules (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    todo_id BIGINT REFERENCES todos(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    notes TEXT,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT schedules_time_range CHECK (end_at > start_at)
);

COMMENT ON TABLE schedules IS '日程表: 独立日历事件，可关联任务';
