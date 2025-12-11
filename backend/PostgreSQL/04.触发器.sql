-- 触发器: 自动维护数据完整性



-- 触发器：自动更新 updated_at 时间戳
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_todos_updated_at
    BEFORE UPDATE ON todos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();



-- 触发器函数：删除任务时级联软删除所有子任务
CREATE OR REPLACE FUNCTION cascade_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- 如果设置了 deleted_at，递归软删除所有子孙任务
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        WITH RECURSIVE descendants AS (
            -- 直接子任务
            SELECT id FROM todos WHERE parent_id = NEW.id AND deleted_at IS NULL
            UNION ALL
            -- 子孙任务
            SELECT t.id FROM todos t
            INNER JOIN descendants d ON t.parent_id = d.id
            WHERE t.deleted_at IS NULL
        )
        UPDATE todos 
        SET deleted_at = NEW.deleted_at 
        WHERE id IN (SELECT id FROM descendants);
    END IF;
    
    -- 如果恢复了任务（deleted_at 设为 NULL），递归恢复所有子孙任务
    IF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
        WITH RECURSIVE descendants AS (
            -- 直接子任务
            SELECT id FROM todos WHERE parent_id = NEW.id AND deleted_at IS NOT NULL
            UNION ALL
            -- 子孙任务
            SELECT t.id FROM todos t
            INNER JOIN descendants d ON t.parent_id = d.id
            WHERE t.deleted_at IS NOT NULL
        )
        UPDATE todos 
        SET deleted_at = NULL 
        WHERE id IN (SELECT id FROM descendants);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cascade_soft_delete
    AFTER UPDATE OF deleted_at ON todos
    FOR EACH ROW
    EXECUTE FUNCTION cascade_soft_delete();






-- 触发器函数：验证截止时间
CREATE OR REPLACE FUNCTION validate_deadline()
RETURNS TRIGGER AS $$
DECLARE
    parent_deadline TIMESTAMPTZ;
BEGIN
    -- 如果没有设置截止时间，直接返回
    IF NEW.deadline IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- 截止时间不能早于创建时间
    IF NEW.deadline < NEW.created_at THEN
        RAISE EXCEPTION '截止时间不能早于创建时间';
    END IF;
    
    -- 如果有父任务，检查父任务的截止时间
    IF NEW.parent_id IS NOT NULL THEN
        SELECT deadline INTO parent_deadline 
        FROM todos 
        WHERE id = NEW.parent_id;
        
        -- 如果父任务有截止时间，子任务的截止时间不能晚于父任务
        IF parent_deadline IS NOT NULL AND NEW.deadline > parent_deadline THEN
            RAISE EXCEPTION '子任务的截止时间不能晚于父任务';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_deadline
    BEFORE INSERT OR UPDATE OF deadline, parent_id ON todos
    FOR EACH ROW
    EXECUTE FUNCTION validate_deadline();





-- 触发器函数：更新父任务状态（基于子任务状态）
CREATE OR REPLACE FUNCTION update_parent_status()
RETURNS TRIGGER AS $$
DECLARE
    parent_status TEXT;
    all_children_done BOOLEAN;
    any_children_doing BOOLEAN;
    child_count INTEGER;
BEGIN
    -- 只有在更新/新增子任务状态时才处理
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- 计算子任务统计
    SELECT 
        BOOL_AND(status = 'done') AS all_done,
        BOOL_OR(status = 'doing') AS any_doing,
        COUNT(*) AS cnt
    INTO all_children_done, any_children_doing, child_count
    FROM todos 
    WHERE parent_id = NEW.parent_id AND deleted_at IS NULL;
    
    -- 如果没有子任务，保持父任务原有状态
    IF child_count = 0 THEN
        RETURN NEW;
    END IF;
    
    -- 根据子任务状态更新父任务
    IF all_children_done THEN
        parent_status := 'done';
    ELSIF any_children_doing THEN
        parent_status := 'doing';
    ELSE
        parent_status := 'todo';
    END IF;
    
    UPDATE todos 
    SET status = parent_status 
    WHERE id = NEW.parent_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_parent_status
    AFTER INSERT OR UPDATE OF status ON todos
    FOR EACH ROW
    EXECUTE FUNCTION update_parent_status();



-- 触发器函数：删除子任务时更新父任务状态
CREATE OR REPLACE FUNCTION update_parent_status_on_delete()
RETURNS TRIGGER AS $$
DECLARE
    parent_status TEXT;
    all_children_done BOOLEAN;
    any_children_doing BOOLEAN;
    child_count INTEGER;
BEGIN
    -- 只有在删除子任务时才处理
    IF OLD.parent_id IS NULL THEN
        RETURN OLD;
    END IF;
    
    -- 计算剩余子任务统计
    SELECT 
        BOOL_AND(status = 'done') AS all_done,
        BOOL_OR(status = 'doing') AS any_doing,
        COUNT(*) AS cnt
    INTO all_children_done, any_children_doing, child_count
    FROM todos 
    WHERE parent_id = OLD.parent_id AND deleted_at IS NULL;
    
    -- 如果没有子任务了，将父任务重置为 'todo'
    IF child_count = 0 THEN
        parent_status := 'todo';
    ELSE
        -- 根据剩余子任务状态更新父任务
        IF all_children_done THEN
            parent_status := 'done';
        ELSIF any_children_doing THEN
            parent_status := 'doing';
        ELSE
            parent_status := 'todo';
        END IF;
    END IF;
    
    UPDATE todos 
    SET status = parent_status 
    WHERE id = OLD.parent_id;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_parent_status_on_delete
    AFTER DELETE ON todos
    FOR EACH ROW
    EXECUTE FUNCTION update_parent_status_on_delete();



-- 触发器函数：防止在已完成的任务中添加新子任务
CREATE OR REPLACE FUNCTION prevent_adding_subtask_to_done()
RETURNS TRIGGER AS $$
DECLARE
    parent_status TEXT;
BEGIN
    -- 只有新增子任务时才检查
    IF NEW.parent_id IS NOT NULL THEN
        SELECT status INTO parent_status
        FROM todos
        WHERE id = NEW.parent_id;
        
        IF parent_status = 'done' THEN
            RAISE EXCEPTION '不能在已完成的任务中添加新子任务';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_adding_subtask_to_done
    BEFORE INSERT ON todos
    FOR EACH ROW
    EXECUTE FUNCTION prevent_adding_subtask_to_done();



-- 触发器函数：改变父任务时验证截止时间
CREATE OR REPLACE FUNCTION validate_deadline_on_parent_change()
RETURNS TRIGGER AS $$
DECLARE
    new_parent_deadline TIMESTAMPTZ;
BEGIN
    -- 仅当改变父任务时触发
    IF NEW.parent_id IS DISTINCT FROM OLD.parent_id AND NEW.parent_id IS NOT NULL THEN
        SELECT deadline INTO new_parent_deadline
        FROM todos
        WHERE id = NEW.parent_id;
        
        -- 如果新父任务有截止时间，验证当前任务的截止时间
        IF new_parent_deadline IS NOT NULL AND NEW.deadline IS NOT NULL THEN
            IF NEW.deadline > new_parent_deadline THEN
                RAISE EXCEPTION '子任务的截止时间不能晚于父任务';
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_deadline_on_parent_change
    BEFORE UPDATE OF parent_id ON todos
    FOR EACH ROW
    EXECUTE FUNCTION validate_deadline_on_parent_change();



-- 触发器函数：防止子任务改变自己的截止时间超过父任务
CREATE OR REPLACE FUNCTION prevent_child_deadline_exceeds_parent()
RETURNS TRIGGER AS $$
DECLARE
    parent_deadline TIMESTAMPTZ;
BEGIN
    -- 仅当截止时间被修改时触发
    IF NEW.deadline IS DISTINCT FROM OLD.deadline AND NEW.parent_id IS NOT NULL THEN
        SELECT deadline INTO parent_deadline
        FROM todos
        WHERE id = NEW.parent_id;
        
        -- 如果父任务有截止时间，验证子任务的截止时间
        IF parent_deadline IS NOT NULL AND NEW.deadline IS NOT NULL THEN
            IF NEW.deadline > parent_deadline THEN
                RAISE EXCEPTION '子任务的截止时间不能晚于父任务';
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_child_deadline_exceeds_parent
    BEFORE UPDATE OF deadline ON todos
    FOR EACH ROW
    EXECUTE FUNCTION prevent_child_deadline_exceeds_parent();



-- 触发器函数：防止修改父任务截止时间违反子任务约束
CREATE OR REPLACE FUNCTION prevent_parent_deadline_violate_children()
RETURNS TRIGGER AS $$
DECLARE
    max_child_deadline TIMESTAMPTZ;
BEGIN
    -- 仅当父任务的截止时间被修改时触发
    IF NEW.deadline IS DISTINCT FROM OLD.deadline AND NEW.parent_id IS NULL THEN
        -- 查询所有子孙任务中的最大截止时间
        SELECT MAX(deadline) INTO max_child_deadline
        FROM todos
        WHERE parent_id = NEW.id AND deadline IS NOT NULL AND deleted_at IS NULL;
        
        -- 如果新的截止时间早于子任务的截止时间，抛出错误
        IF max_child_deadline IS NOT NULL AND NEW.deadline IS NOT NULL THEN
            IF NEW.deadline < max_child_deadline THEN
                RAISE EXCEPTION '父任务的截止时间不能早于其子任务的截止时间';
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_parent_deadline_violate_children
    BEFORE UPDATE OF deadline ON todos
    FOR EACH ROW
    EXECUTE FUNCTION prevent_parent_deadline_violate_children();
