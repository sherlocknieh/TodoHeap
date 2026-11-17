-- TodoHeap 数据库基线: 表结构
-- 重置数据库后按时间戳顺序执行; 本文件只负责建表,
-- 索引 / RLS / 视图 / 函数 / 触发器 / Realtime / 日历订阅分别在各文件中

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
    duration DECIMAL(5,2) DEFAULT NULL,     -- 预计耗时(小时), 小数表示半小时等粒度
    completed_at TIMESTAMPTZ DEFAULT NULL,  -- 完成时间, 非空表示已完成
    external_id TEXT DEFAULT NULL,          -- 外部系统来源标识, 形如 ticktick:<task id>
    client_key TEXT DEFAULT NULL,           -- 客户端生成的创建幂等键, 重试与实时回推靠它认领同一条
    is_root BOOLEAN NOT NULL DEFAULT FALSE, -- 每个用户一条系统根任务「全部任务」
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

COMMENT ON COLUMN todos.child_ids IS '子任务 ID 列表, 数组顺序就是手动显示顺序';
COMMENT ON COLUMN todos.duration IS '预计耗时(小时), 小数表示半小时等粒度';
COMMENT ON COLUMN todos.external_id IS '外部系统来源标识, 形如 ticktick:<task id>; 手工创建的任务保持 NULL';
COMMENT ON COLUMN todos.client_key IS '客户端生成的创建幂等键; 同一用户下唯一, 用于重试去重与实时回推认领';
COMMENT ON COLUMN todos.is_root IS '系统根任务标记, 每个用户恰好一条; 顶层任务挂在它的 child_ids 下';

-- ---------------------------------------------------------------------------
-- 用户设置表
-- ---------------------------------------------------------------------------

-- 每个用户一行 JSONB 偏好
CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_settings IS '用户个性化设置表';
COMMENT ON COLUMN user_settings.settings IS '存储用户设置的 JSON 对象，如 {"autoApplyAITasks": false}';

-- ---------------------------------------------------------------------------
-- 日程表
-- ---------------------------------------------------------------------------

-- 独立日历事件, 可选关联任务; 字段按 ICS 语义拆分, 备注不再承担地点/参与人
CREATE TABLE schedules (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    todo_id BIGINT REFERENCES todos(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    notes TEXT,                                  -- 描述, 对应 ICS DESCRIPTION
    location TEXT,                               -- 地点, 对应 ICS LOCATION
    url TEXT,                                    -- 会议链接或相关页面, 对应 ICS URL
    attendees TEXT[] NOT NULL DEFAULT '{}',      -- 参与人姓名或邮箱, 对应 ICS ATTENDEE
    all_day BOOLEAN NOT NULL DEFAULT FALSE,      -- 全天事件, 对应 DATE 型 DTSTART/DTEND
    status TEXT NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
    color TEXT CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),
    reminder_minutes INTEGER[] NOT NULL DEFAULT '{}', -- 提前提醒的分钟数, 对应 VALARM
    external_id TEXT,                            -- 外部来源键(含重复实例), 用于重复导入去重
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT schedules_time_range CHECK (end_at > start_at)
);

COMMENT ON TABLE schedules IS '日程表: 独立日历事件，可关联任务';
COMMENT ON COLUMN schedules.notes IS '描述正文, 对应 ICS DESCRIPTION';
COMMENT ON COLUMN schedules.attendees IS '参与人姓名或邮箱, 对应 ICS ATTENDEE';
COMMENT ON COLUMN schedules.all_day IS '全天事件; start_at/end_at 用 UTC 零点表示日期, end_at 为次日零点(不含)';
COMMENT ON COLUMN schedules.status IS '确认状态: confirmed/tentative/cancelled';
COMMENT ON COLUMN schedules.reminder_minutes IS '开始前多少分钟提醒, 对应 ICS VALARM';
COMMENT ON COLUMN schedules.external_id IS '外部来源唯一键, 形如 ics:<uid>:<实例开始时间>; 用于重复导入去重';
