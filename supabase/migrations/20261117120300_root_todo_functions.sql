-- TodoHeap: 根任务维护函数
-- ensure_root_todo 幂等建根; attach_root_children 把无父任务补挂到根任务;
-- todos_guard_root 只放行根任务的 child_ids; create_todo 把顶层任务统一挂到根任务

-- 把没有父链接的任务按当前显示顺序补挂到根任务, 幂等且只追加缺失的 ID。
-- 用于旧数据恢复(restore.sql 不含根任务)与首屏懒创建后的兜底
CREATE OR REPLACE FUNCTION public.attach_root_children()
RETURNS public.todos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id uuid := auth.uid();
    root public.todos;
    missing BIGINT[];
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO root FROM public.todos WHERE user_id = current_user_id AND is_root;
    IF NOT FOUND THEN
        RAISE EXCEPTION '根任务不存在';
    END IF;

    SELECT COALESCE(array_agg(candidate.id ORDER BY candidate.sort_order NULLS LAST,
                             candidate.created_at, candidate.id), '{}'::BIGINT[])
    INTO missing
    FROM public.todos candidate
    WHERE candidate.user_id = current_user_id
      AND NOT candidate.is_root
      AND NOT (candidate.id = ANY(root.child_ids))
      AND NOT EXISTS (
          SELECT 1
          FROM public.todos parent
          WHERE parent.user_id = current_user_id
            AND parent.id <> candidate.id
            AND candidate.id = ANY(parent.child_ids)
      );

    IF cardinality(missing) > 0 THEN
        UPDATE public.todos
        SET child_ids = root.child_ids || missing
        WHERE id = root.id;

        SELECT * INTO root FROM public.todos WHERE id = root.id;
    END IF;

    RETURN root;
END;
$$;

-- 取当前用户的根任务, 没有就建一条; 新建后立刻补挂已有顶层任务。
-- SECURITY DEFINER: 根任务不受插入策略限制, 已有根任务的排序也不会被覆盖
CREATE OR REPLACE FUNCTION public.ensure_root_todo()
RETURNS public.todos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id uuid := auth.uid();
    root public.todos;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO root FROM public.todos WHERE user_id = current_user_id AND is_root;
    IF FOUND THEN
        RETURN root;
    END IF;

    INSERT INTO public.todos (user_id, title, is_root)
    VALUES (current_user_id, '全部任务', TRUE)
    ON CONFLICT (user_id) WHERE is_root DO NOTHING
    RETURNING * INTO root;

    IF NOT FOUND THEN
        -- 并发下另一请求已经建好根任务, 直接复用
        SELECT * INTO root FROM public.todos WHERE user_id = current_user_id AND is_root;
        RETURN root;
    END IF;

    RETURN public.attach_root_children();
END;
$$;

-- 根任务只允许调整 child_ids; 其它字段(标题/完成态/删除态/所属用户)一律拒绝。
-- 删除保护放在 RLS, 避免阻断删号时的外键级联
CREATE OR REPLACE FUNCTION public.todos_guard_root()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF (NEW.is_root OR OLD.is_root)
        AND (to_jsonb(NEW) - 'child_ids' - 'updated_at')
            IS DISTINCT FROM (to_jsonb(OLD) - 'child_ids' - 'updated_at') THEN
        RAISE EXCEPTION '根任务只允许调整子任务顺序';
    END IF;

    RETURN NEW;
END;
$$;

-- 原子地创建任务: 显式父级照旧, 未指定父级时挂到根任务
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
    parent_id BIGINT := p_parent_id;
BEGIN
    IF parent_id IS NULL THEN
        SELECT (public.ensure_root_todo()).id INTO parent_id;
    END IF;

    INSERT INTO public.todos (user_id, title, details, deadline, sort_order, difficulty, completed_at, external_id)
    VALUES (auth.uid(), p_title, p_details, p_deadline, p_sort_order, p_difficulty, p_completed_at, p_external_id)
    RETURNING * INTO created;

    IF parent_id IS NOT NULL THEN
        UPDATE public.todos
        SET child_ids = array_append(child_ids, created.id)
        WHERE id = parent_id
          AND user_id = auth.uid()
          AND NOT (created.id = ANY(child_ids));
    END IF;

    RETURN created;
END;
$$;
