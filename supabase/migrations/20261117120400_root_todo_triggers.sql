-- TodoHeap: 根任务保护触发器
-- 依赖 20261117120300_root_todo_functions.sql 中的 todos_guard_root

CREATE TRIGGER trg_todos_guard_root
    BEFORE UPDATE ON todos
    FOR EACH ROW EXECUTE FUNCTION public.todos_guard_root();
