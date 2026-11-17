-- 任务创建幂等键: client_key
-- 基线迁移已包含该结构; 本文件用于已部署库的增量升级, 全部语句幂等,
-- 在全新重置(基线先执行)与增量升级两种顺序下都能安全重放。

ALTER TABLE todos ADD COLUMN IF NOT EXISTS client_key TEXT DEFAULT NULL;

COMMENT ON COLUMN todos.client_key IS '客户端生成的创建幂等键; 同一用户下唯一, 用于重试去重与实时回推认领';

-- 同一用户下幂等键唯一, 手工任务(NULL)不参与
CREATE UNIQUE INDEX IF NOT EXISTS idx_todos_user_client_key ON todos(user_id, client_key)
WHERE client_key IS NOT NULL;

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
