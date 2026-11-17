-- TodoHeap: difficulty 明确为「预计耗时」
-- 字段含义一直是工时, 这里把列名与 create_todo 参数统一改为 duration;
-- 历史数据原样保留, 旧迁移保持不动

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'todos' AND column_name = 'difficulty'
    ) THEN
        ALTER TABLE public.todos RENAME COLUMN difficulty TO duration;
    END IF;
END;
$$;

COMMENT ON COLUMN public.todos.duration IS '预计耗时(小时), 小数表示半小时等粒度';

-- 参数名属于对外接口; PostgreSQL 不允许 CREATE OR REPLACE 改输入参数名, 只能先删后建
DROP FUNCTION IF EXISTS public.create_todo(TEXT, TEXT, TIMESTAMPTZ, INTEGER, NUMERIC, TIMESTAMPTZ, BIGINT, TEXT);

CREATE FUNCTION public.create_todo(
    p_title TEXT,
    p_details TEXT DEFAULT NULL,
    p_deadline TIMESTAMPTZ DEFAULT NULL,
    p_sort_order INTEGER DEFAULT NULL,
    p_duration NUMERIC DEFAULT NULL,
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

    INSERT INTO public.todos (user_id, title, details, deadline, sort_order, duration, completed_at, external_id)
    VALUES (auth.uid(), p_title, p_details, p_deadline, p_sort_order, p_duration, p_completed_at, p_external_id)
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
