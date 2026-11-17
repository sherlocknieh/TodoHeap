-- TodoHeap 数据库基线: 函数
-- 通用维护函数、账号删除、根任务维护与任务树的写入/软删除维护

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
-- 根任务
-- ---------------------------------------------------------------------------

-- 把没有父链接的任务按创建顺序补挂到根任务, 幂等且只追加缺失的 ID。
-- 用于旧数据恢复后的兜底; 手动顺序仍以根任务 child_ids 的现有排列为准
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

    SELECT COALESCE(array_agg(candidate.id ORDER BY candidate.created_at, candidate.id), '{}'::BIGINT[])
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
-- SECURITY DEFINER: 根任务不受插入策略限制, 已有根任务的顺序也不会被覆盖
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

-- ---------------------------------------------------------------------------
-- 任务树
-- ---------------------------------------------------------------------------

-- 软删除传播: 删除父任务时只带走没有其它可恢复父链接的后代;
-- 还原仍同步整棵后代, 保证从垃圾箱恢复父级时子树一起回来。
CREATE OR REPLACE FUNCTION public.todos_propagate_deleted_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    affected_ids BIGINT[];
    previous_count INTEGER;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
        IF NEW.deleted_at IS NOT NULL THEN
            -- 迭代扩张删除集合: 子任务只有在所有父级都在集合内时才一起删除
            affected_ids := ARRAY[NEW.id];
            LOOP
                previous_count := cardinality(affected_ids);

                WITH candidates AS (
                    SELECT DISTINCT c.id
                    FROM todos c
                    WHERE c.deleted_at IS NULL
                      AND c.id <> ALL(affected_ids)
                      AND EXISTS (
                          SELECT 1
                          FROM todos p
                          WHERE p.id = ANY(affected_ids)
                            AND c.id = ANY(p.child_ids)
                      )
                      AND NOT EXISTS (
                          SELECT 1
                          FROM todos q
                          WHERE c.id = ANY(q.child_ids)
                            AND q.id <> ALL(affected_ids)
                            AND q.deleted_at IS NULL
                      )
                )
                SELECT affected_ids || COALESCE(array_agg(id), '{}'::BIGINT[])
                INTO affected_ids
                FROM candidates;

                EXIT WHEN cardinality(affected_ids) = previous_count;
            END LOOP;

            UPDATE todos
            SET deleted_at = NEW.deleted_at, updated_at = NOW()
            WHERE id = ANY(affected_ids)
              AND deleted_at IS DISTINCT FROM NEW.deleted_at;
        ELSE
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

-- 原子地创建任务: 显式父级照旧, 未指定父级时挂到根任务
-- p_client_key 是客户端生成的幂等键: 同一用户重复提交(重试/重放)时直接返回已建记录, 不再插入
CREATE OR REPLACE FUNCTION public.create_todo(
    p_title TEXT,
    p_details TEXT DEFAULT NULL,
    p_deadline TIMESTAMPTZ DEFAULT NULL,
    p_duration NUMERIC DEFAULT NULL,
    p_completed_at TIMESTAMPTZ DEFAULT NULL,
    p_parent_id BIGINT DEFAULT NULL,
    p_external_id TEXT DEFAULT NULL,
    p_client_key TEXT DEFAULT NULL
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

    IF p_client_key IS NOT NULL THEN
        SELECT * INTO created
        FROM public.todos
        WHERE user_id = auth.uid() AND client_key = p_client_key;
        IF FOUND THEN
            -- 重试命中已建记录: 只补挂父级, 保证不会出现孤立任务
            IF parent_id IS NOT NULL THEN
                UPDATE public.todos
                SET child_ids = array_append(child_ids, created.id)
                WHERE id = parent_id
                  AND user_id = auth.uid()
                  AND NOT (created.id = ANY(child_ids));
            END IF;
            RETURN created;
        END IF;
    END IF;

    INSERT INTO public.todos (user_id, title, details, deadline, duration, completed_at, external_id, client_key)
    VALUES (auth.uid(), p_title, p_details, p_deadline, p_duration, p_completed_at, p_external_id, p_client_key)
    ON CONFLICT (user_id, client_key) WHERE client_key IS NOT NULL DO NOTHING
    RETURNING * INTO created;

    IF NOT FOUND THEN
        -- 并发下另一请求已用同一 client_key 建好, 复用那条记录
        SELECT * INTO created
        FROM public.todos
        WHERE user_id = auth.uid() AND client_key = p_client_key;
    END IF;

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

-- 批量把子任务挂到父任务下: 保留已有顺序, 新 ID 按传入顺序追加并去重
CREATE OR REPLACE FUNCTION public.append_todo_children(
    p_parent_id BIGINT,
    p_child_ids BIGINT[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    incoming BIGINT[];
BEGIN
    IF p_child_ids IS NULL OR cardinality(p_child_ids) = 0 THEN
        RETURN;
    END IF;

    WITH ordered AS (
        SELECT child_id, MIN(position) AS position
        FROM unnest(p_child_ids) WITH ORDINALITY AS item(child_id, position)
        GROUP BY child_id
    )
    SELECT COALESCE(array_agg(child_id ORDER BY position), '{}'::BIGINT[])
    INTO incoming
    FROM ordered;

    UPDATE todos
    SET child_ids = child_ids || ARRAY(
        SELECT child_id
        FROM unnest(incoming) AS child_id
        WHERE NOT child_id = ANY(child_ids)
    )
    WHERE id = p_parent_id
      AND user_id = auth.uid();
END;
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
