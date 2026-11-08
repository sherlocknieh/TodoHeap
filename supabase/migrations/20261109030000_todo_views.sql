-- TodoHeap 数据库基线: 视图
-- security_invoker 保证视图继承底层表的行级安全

-- ---------------------------------------------------------------------------
-- 视图
-- ---------------------------------------------------------------------------

-- 叶子任务: 没有子任务的未删除任务
CREATE VIEW leaf_todos WITH (security_invoker = on) AS
SELECT * FROM todos t
WHERE t.deleted_at IS NULL
  AND cardinality(t.child_ids) = 0;

-- 回收站: 已删除任务, 附叶子标记与子任务数量
CREATE VIEW trash_todos WITH (security_invoker = on) AS
SELECT
    t.*,
    cardinality(t.child_ids) = 0 AS is_leaf,
    cardinality(t.child_ids) AS child_count
FROM todos t
WHERE t.deleted_at IS NOT NULL;
