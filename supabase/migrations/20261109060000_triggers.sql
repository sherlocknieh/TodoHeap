-- TodoHeap 数据库基线: 触发器
-- 依赖 20261109040000_functions.sql 中的函数, 必须在其之后执行

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_todos_updated_at
    BEFORE UPDATE ON todos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 任务树维护
-- ---------------------------------------------------------------------------

-- 软删除/还原时同步子孙任务
CREATE TRIGGER trg_todos_propagate_deleted_at
    AFTER UPDATE OF deleted_at ON todos
    FOR EACH ROW EXECUTE FUNCTION public.todos_propagate_deleted_at();

-- 物理删除时摘除父任务里的引用
CREATE TRIGGER trg_todos_detach_on_delete
    AFTER DELETE ON todos
    FOR EACH ROW EXECUTE FUNCTION public.todos_detach_on_delete();
