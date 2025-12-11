-- 视图: 预查询表, 为复杂查询提供简化接口
-- 注意: 必须写有 with (security_invoker=on) 防止绕过行级安全策略


-- 堆视图：获取所有叶子任务
CREATE OR REPLACE VIEW leaf_todos with (security_invoker=on) AS
SELECT * FROM todos 
WHERE id NOT IN (SELECT DISTINCT parent_id FROM todos WHERE parent_id IS NOT NULL) 
  AND deleted_at IS NULL;


-- 回收站视图: 获取所有标记为删除的任务
CREATE OR REPLACE VIEW public.trash_todos
WITH (security_invoker=on) AS
SELECT
  t.*,
  -- 标记是否为叶子节点（子节点也可能在回收站或未删除）
  NOT EXISTS (
    SELECT 1 FROM public.todos c
    WHERE c.parent_id = t.id
      AND c.deleted_at IS NULL   -- 若想要把“在回收站中没有未删除子节点”视为叶子，可保留此行
  ) AS is_leaf,
  -- 子节点计数（可选，帮助判断有多少子节点需要同时处理/恢复）
  (SELECT COUNT(*) FROM public.todos c WHERE c.parent_id = t.id) AS child_count
FROM public.todos t
WHERE t.deleted_at IS NOT NULL;