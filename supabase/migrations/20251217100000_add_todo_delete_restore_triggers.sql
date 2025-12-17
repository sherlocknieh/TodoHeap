-- Migration: add_todo_delete_restore_triggers
-- Created: 2025-12-17 10:00:00
-- Description: 添加触发器函数与触发器，自动将父任务的软删除/还原传播到所有子孙任务。

BEGIN;

-- 函数：当父任务的 deleted_at 发生变化时，传播到所有子孙任务
CREATE OR REPLACE FUNCTION todos_propagate_deleted_at() RETURNS trigger AS $$
BEGIN
  -- 仅在 deleted_at 字段发生变化时处理
  IF (TG_OP = 'UPDATE') THEN
    -- 软删除：从 NULL -> 非 NULL，将 deleted_at 赋值给所有子孙
    IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
      WITH RECURSIVE descendants AS (
        SELECT id FROM todos WHERE parent_id = NEW.id
        UNION ALL
        SELECT t.id FROM todos t JOIN descendants d ON t.parent_id = d.id
      )
      UPDATE todos
      SET deleted_at = NEW.deleted_at, updated_at = NOW()
      WHERE id IN (SELECT id FROM descendants) AND deleted_at IS DISTINCT FROM NEW.deleted_at;

      RETURN NEW;

    -- 还原：从 非 NULL -> NULL，将 deleted_at 置为 NULL（还原）给所有子孙
    ELSIF (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
      WITH RECURSIVE descendants AS (
        SELECT id FROM todos WHERE parent_id = NEW.id
        UNION ALL
        SELECT t.id FROM todos t JOIN descendants d ON t.parent_id = d.id
      )
      UPDATE todos
      SET deleted_at = NULL, updated_at = NOW()
      WHERE id IN (SELECT id FROM descendants) AND deleted_at IS NOT NULL;

      RETURN NEW;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 注册触发器：在更新 deleted_at 字段后触发
DROP TRIGGER IF EXISTS trg_todos_propagate_deleted_at ON todos;
CREATE TRIGGER trg_todos_propagate_deleted_at
AFTER UPDATE OF deleted_at ON todos
FOR EACH ROW
EXECUTE FUNCTION todos_propagate_deleted_at();

COMMIT;

-- 说明：
-- 1) 物理删除（DELETE）由 parent_id 上的 FOREIGN KEY ON DELETE CASCADE 处理。
-- 2) 该触发器处理软删除（设置 deleted_at）与还原（将 deleted_at 设为 NULL）。
-- 3) 如果需要在触发器中加入权限或 user_id 校验，可在 UPDATE 子句中加入额外的 WHERE 条件。
