-- TodoHeap: 根任务数据回填
-- 1) 为已有用户补建根任务; 2) 按下单当前显示顺序重排每个父级的 child_ids;
-- 3) 把顶层任务按当前显示顺序写进根任务的 child_ids
-- 排序近似: sort_order -> created_at -> id。现有数据的显示顺序与前端
-- Intl.Collator('zh-Hans-CN') 逐父级比对一致, 回填不改变任何可见顺序

INSERT INTO public.todos (user_id, title, is_root)
SELECT u.id, '全部任务', TRUE
FROM auth.users u
ON CONFLICT (user_id) WHERE is_root DO NOTHING;

-- 父级内的顺序: 已知任务按显示顺序, 已物理删除的孤立 ID 保持原相对位置追加在末尾
WITH ordered AS (
    SELECT parent.id AS parent_id,
           ARRAY(
               SELECT child.id
               FROM public.todos child
               WHERE child.id = ANY(parent.child_ids)
               ORDER BY child.sort_order NULLS LAST, child.created_at, child.id
           ) || ARRAY(
               SELECT orphan
               FROM unnest(parent.child_ids) AS orphan
               WHERE NOT EXISTS (SELECT 1 FROM public.todos known WHERE known.id = orphan)
           ) AS ids
    FROM public.todos parent
    WHERE cardinality(parent.child_ids) > 0
)
UPDATE public.todos target
SET child_ids = ordered.ids
FROM ordered
WHERE target.id = ordered.parent_id
  AND target.child_ids IS DISTINCT FROM ordered.ids;

-- 顶层任务: 没有任何父链接的任务, 按显示顺序挂到根任务。
-- 只在根任务还没有子列表时写入, 保证重复执行不会覆盖后来的手动顺序
WITH top_level AS (
    SELECT candidate.id, candidate.user_id, candidate.sort_order, candidate.created_at
    FROM public.todos candidate
    WHERE NOT candidate.is_root
      AND NOT EXISTS (
          SELECT 1
          FROM public.todos parent
          WHERE parent.id <> candidate.id
            AND candidate.id = ANY(parent.child_ids)
      )
)
UPDATE public.todos root
SET child_ids = (
    SELECT COALESCE(array_agg(top.id ORDER BY top.sort_order NULLS LAST, top.created_at, top.id),
                    '{}'::BIGINT[])
    FROM top_level top
    WHERE top.user_id = root.user_id
)
WHERE root.is_root
  AND cardinality(root.child_ids) = 0;
