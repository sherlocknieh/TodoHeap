-- TodoHeap: 真实根任务
-- 每个用户一条 is_root 任务, 顶层任务挂在它的 child_ids 下;
-- 本次只引入标记, 手动排序的真相源仍是 sort_order

ALTER TABLE todos ADD COLUMN is_root BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN todos.is_root IS '系统根任务标记, 每个用户恰好一条; 顶层任务挂在它的 child_ids 下';
