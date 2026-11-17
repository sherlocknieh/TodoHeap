-- TodoHeap: 根任务索引
-- 每个用户只允许一条根任务, 由部分唯一索引兜底

CREATE UNIQUE INDEX idx_todos_user_root ON todos(user_id) WHERE is_root;
