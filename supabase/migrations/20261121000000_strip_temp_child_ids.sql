-- 清理父级 child_ids 里的负数临时 ID
-- 临时 ID 只存在于客户端同步队列, 一旦被写进 child_ids 就是幽灵引用:
-- 既不指向任何任务行, 还会和客户端新生成的临时 ID 撞号, ID 替换时把别的父级改错。

UPDATE public.todos
SET child_ids = ARRAY(SELECT id FROM unnest(child_ids) AS t(id) WHERE id > 0)
WHERE child_ids IS NOT NULL
  AND EXISTS (SELECT 1 FROM unnest(child_ids) AS t(id) WHERE id <= 0);
