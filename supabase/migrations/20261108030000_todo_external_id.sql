-- 外部来源标识: 让同一份导出的任务落在同一行, 重复导入只更新不新建

-- ---------------------------------------------------------------------------
-- 列: 记录来源系统与来源 ID
-- ---------------------------------------------------------------------------

ALTER TABLE todos ADD COLUMN external_id TEXT DEFAULT NULL;
COMMENT ON COLUMN todos.external_id IS '外部系统来源标识, 形如 ticktick:<task id>; 手工创建的任务保持 NULL';

-- 同一用户下来源标识唯一; 手工任务不参与唯一约束
CREATE UNIQUE INDEX idx_todos_user_external ON todos(user_id, external_id)
WHERE external_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- create_todo: 增加来源标识参数, 其余行为不变
-- ---------------------------------------------------------------------------

-- 参数增加会形成重载, 先删掉旧签名, 避免 RPC 按命名参数调用时两个版本都能匹配
DROP FUNCTION IF EXISTS public.create_todo(TEXT, TEXT, TIMESTAMPTZ, INTEGER, NUMERIC, TIMESTAMPTZ, BIGINT);

CREATE OR REPLACE FUNCTION public.create_todo(
    p_title TEXT,
    p_details TEXT DEFAULT NULL,
    p_deadline TIMESTAMPTZ DEFAULT NULL,
    p_sort_order INTEGER DEFAULT NULL,
    p_difficulty NUMERIC DEFAULT NULL,
    p_completed_at TIMESTAMPTZ DEFAULT NULL,
    p_parent_id BIGINT DEFAULT NULL,
    p_external_id TEXT DEFAULT NULL
)
RETURNS public.todos
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    created public.todos;
BEGIN
    INSERT INTO public.todos (user_id, title, details, deadline, sort_order, difficulty, completed_at, external_id)
    VALUES (auth.uid(), p_title, p_details, p_deadline, p_sort_order, p_difficulty, p_completed_at, p_external_id)
    RETURNING * INTO created;

    IF p_parent_id IS NOT NULL THEN
        UPDATE public.todos
        SET child_ids = array_append(child_ids, created.id)
        WHERE id = p_parent_id
          AND user_id = auth.uid()
          AND NOT (created.id = ANY(child_ids));
    END IF;

    RETURN created;
END;
$$;
