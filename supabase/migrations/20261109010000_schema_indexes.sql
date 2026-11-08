-- TodoHeap 数据库基线: 索引
-- 覆盖用户维度、子任务关系、外部来源、回收站排序与日程时间范围

-- ---------------------------------------------------------------------------
-- todos
-- ---------------------------------------------------------------------------

-- 任务列表: 只扫未删除任务
CREATE INDEX idx_todos_user_active ON todos(user_id) WHERE deleted_at IS NULL;

-- 截止时间排序与提醒
CREATE INDEX idx_todos_deadline ON todos(user_id, deadline) WHERE deleted_at IS NULL;

-- 子任务关系查询与包含判断
CREATE INDEX idx_todos_child_ids ON todos USING GIN (child_ids);

-- 导入去重: 同一用户下来源标识唯一, 手工任务不参与
CREATE UNIQUE INDEX idx_todos_user_external ON todos(user_id, external_id)
WHERE external_id IS NOT NULL;

-- 回收站: 按用户筛选已删除任务并按删除时间倒序
CREATE INDEX idx_todos_user_trash ON todos(user_id, deleted_at DESC)
WHERE deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- schedules
-- ---------------------------------------------------------------------------

CREATE INDEX idx_schedules_user_range ON schedules(user_id, start_at);
CREATE INDEX idx_schedules_todo ON schedules(todo_id) WHERE todo_id IS NOT NULL;
