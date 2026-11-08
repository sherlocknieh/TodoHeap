-- 任务关系从「子指向父」改为「父保存子列表」, 并允许图中存在环
-- child_ids 是唯一的关系来源; 多父与环都是合法数据

-- ---------------------------------------------------------------------------
-- 列: 新增 child_ids 并由现有 parent_id 回填
-- ---------------------------------------------------------------------------

ALTER TABLE todos ADD COLUMN child_ids BIGINT[] NOT NULL DEFAULT '{}';

UPDATE todos t
SET child_ids = COALESCE(
    (SELECT array_agg(c.id ORDER BY c.sort_order, c.id)
     FROM todos c
     WHERE c.parent_id = t.id),
    '{}'
);

-- 视图与触发器依赖 parent_id, 先移除再删列
DROP VIEW IF EXISTS leaf_todos;
DROP VIEW IF EXISTS trash_todos;
DROP TRIGGER IF EXISTS trg_todos_propagate_deleted_at ON todos;

ALTER TABLE todos DROP COLUMN parent_id;

CREATE INDEX idx_todos_child_ids ON todos USING GIN (child_ids);

-- ---------------------------------------------------------------------------
-- 视图: 叶子与回收站按 child_ids 统计
-- ---------------------------------------------------------------------------

CREATE VIEW leaf_todos WITH (security_invoker = on) AS
SELECT * FROM todos t
WHERE t.deleted_at IS NULL
  AND cardinality(t.child_ids) = 0;

CREATE VIEW trash_todos WITH (security_invoker = on) AS
SELECT
    t.*,
    cardinality(t.child_ids) = 0 AS is_leaf,
    cardinality(t.child_ids) AS child_count
FROM todos t
WHERE t.deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 软删除传播: 沿 child_ids 递归, path 保证环不会无限展开
-- ---------------------------------------------------------------------------

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

CREATE TRIGGER trg_todos_propagate_deleted_at
    AFTER UPDATE OF deleted_at ON todos
    FOR EACH ROW EXECUTE FUNCTION public.todos_propagate_deleted_at();

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

CREATE TRIGGER trg_todos_detach_on_delete
    AFTER DELETE ON todos
    FOR EACH ROW EXECUTE FUNCTION public.todos_detach_on_delete();

-- ---------------------------------------------------------------------------
-- RPC: 原子地创建带父任务的任务, 以及维护子列表
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_todo(
    p_title TEXT,
    p_details TEXT DEFAULT NULL,
    p_deadline TIMESTAMPTZ DEFAULT NULL,
    p_sort_order INTEGER DEFAULT NULL,
    p_difficulty NUMERIC DEFAULT NULL,
    p_completed_at TIMESTAMPTZ DEFAULT NULL,
    p_parent_id BIGINT DEFAULT NULL
)
RETURNS public.todos
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    created public.todos;
BEGIN
    INSERT INTO public.todos (user_id, title, details, deadline, sort_order, difficulty, completed_at)
    VALUES (auth.uid(), p_title, p_details, p_deadline, p_sort_order, p_difficulty, p_completed_at)
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
