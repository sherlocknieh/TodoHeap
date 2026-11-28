-- 禁止新增环形父子链接
-- 数据库层兜底: 客户端所有写路径已在 stores/todos.optimistic.js 的 updateTodo 统一拦截,
-- 这里再按「本次新增的子 ID」检查一次, 防止绕过前端(直连 / 导入 / 历史脚本)写入环。
-- 机制见 docs/src/content/docs/dev/logic/task-cycle-guard.md

CREATE OR REPLACE FUNCTION public.todos_prevent_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    added BIGINT[];
BEGIN
    IF TG_OP = 'INSERT' THEN
        added := NEW.child_ids;
    ELSE
        IF NEW.child_ids IS NOT DISTINCT FROM OLD.child_ids THEN
            RETURN NEW;
        END IF;

        SELECT COALESCE(array_agg(c), '{}'::BIGINT[])
        INTO added
        FROM unnest(NEW.child_ids) AS c
        WHERE NOT c = ANY(OLD.child_ids);
    END IF;

    IF cardinality(added) = 0 THEN
        RETURN NEW;
    END IF;

    -- 任务不能成为自己的子任务
    IF NEW.id = ANY(added) THEN
        RAISE EXCEPTION '禁止形成环形依赖';
    END IF;

    -- 新增子任务的子树里出现父任务即闭环; path 剪断历史环, 不会无限递归
    IF EXISTS (
        WITH RECURSIVE descendants AS (
            SELECT t.id, t.child_ids, ARRAY[t.id] AS path
            FROM todos t
            WHERE t.id = ANY(added)
            UNION ALL
            SELECT child.id, child.child_ids, d.path || child.id
            FROM descendants d
            JOIN todos child ON child.id = ANY(d.child_ids)
            WHERE NOT child.id = ANY(d.path)
        )
        SELECT 1 FROM descendants WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION '禁止形成环形依赖';
    END IF;

    RETURN NEW;
END;
$$;

-- 只在子列表变化时检查, 其它字段的更新不受影响
DROP TRIGGER IF EXISTS trg_todos_prevent_cycle ON todos;
CREATE TRIGGER trg_todos_prevent_cycle
    BEFORE INSERT OR UPDATE OF child_ids ON todos
    FOR EACH ROW EXECUTE FUNCTION public.todos_prevent_cycle();

COMMENT ON COLUMN todos.child_ids IS '子任务 ID 列表, 数组顺序就是手动显示顺序; 允许多父, 环形链接由 trg_todos_prevent_cycle 拒绝';
