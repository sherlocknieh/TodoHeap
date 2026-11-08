-- TodoHeap 数据库基线: 函数
-- 通用维护函数、账号删除与任务树的写入/软删除维护

-- ---------------------------------------------------------------------------
-- 通用
-- ---------------------------------------------------------------------------

-- 更新前刷新 updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 删除当前登录账号, 其余数据由外键级联清理
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id uuid;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    DELETE FROM auth.users WHERE id = current_user_id;

    RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------
-- 任务树
-- ---------------------------------------------------------------------------

-- 软删除传播: 父任务删除或还原时同步全部子孙任务
-- 沿 child_ids 递归, path 保证环不会无限展开
CREATE OR REPLACE FUNCTION public.todos_propagate_deleted_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
        WITH RECURSIVE descendants AS (
            SELECT c.id, c.child_ids, ARRAY[NEW.id, c.id] AS path
            FROM todos c
            WHERE c.id = ANY(NEW.child_ids)
            UNION ALL
            SELECT g.id, g.child_ids, d.path || g.id
            FROM todos g
            JOIN descendants d ON g.id = ANY(d.child_ids)
            WHERE NOT g.id = ANY(d.path)
        )
        UPDATE todos
        SET deleted_at = NEW.deleted_at, updated_at = NOW()
        WHERE id IN (SELECT id FROM descendants)
          AND deleted_at IS DISTINCT FROM NEW.deleted_at;
    END IF;

    RETURN NEW;
END;
$$;

-- 物理删除时从所有父节点的子列表移除该 ID, 避免悬挂引用
CREATE OR REPLACE FUNCTION public.todos_detach_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    UPDATE todos
    SET child_ids = array_remove(child_ids, OLD.id)
    WHERE user_id = OLD.user_id
      AND id <> OLD.id
      AND OLD.id = ANY(child_ids);

    RETURN OLD;
END;
$$;

-- 原子地创建任务, 并在指定父任务下挂入子列表
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

-- 批量把子任务挂到父任务下, 自动去重
CREATE OR REPLACE FUNCTION public.append_todo_children(
    p_parent_id BIGINT,
    p_child_ids BIGINT[]
)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
    UPDATE todos
    SET child_ids = (
        SELECT array_agg(DISTINCT c ORDER BY c)
        FROM unnest(child_ids || p_child_ids) AS c
    )
    WHERE id = p_parent_id
      AND user_id = auth.uid()
      AND p_child_ids IS NOT NULL
      AND cardinality(p_child_ids) > 0;
$$;

-- 批量把子任务从各自父任务下摘除
CREATE OR REPLACE FUNCTION public.detach_todo_children(p_child_ids BIGINT[])
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
    UPDATE todos
    SET child_ids = ARRAY(
        SELECT c FROM unnest(child_ids) AS c WHERE NOT c = ANY(p_child_ids)
    )
    WHERE user_id = auth.uid()
      AND child_ids && p_child_ids;
$$;
