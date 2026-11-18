-- 新建任务排到父级首位
-- child_ids 的数组顺序就是显示顺序，原先新任务 array_append 到末尾，
-- 用户刚添加的任务会掉到列表最下面；改为头插，最近添加的在最上面。
-- 签名与 20261118000000 一致，只换函数体，不会产生重载。

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
                SET child_ids = ARRAY[created.id] || child_ids
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
        SET child_ids = ARRAY[created.id] || child_ids
        WHERE id = parent_id
          AND user_id = auth.uid()
          AND NOT (created.id = ANY(child_ids));
    END IF;

    RETURN created;
END;
$$;
