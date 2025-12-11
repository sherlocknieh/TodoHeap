-- 函数: 更复杂的任务查询和删改任务

-- 函数：递归获取任务的所有子任务
CREATE OR REPLACE FUNCTION get_all_descendants(task_id BIGINT)
RETURNS TABLE (
    id BIGINT,
    title TEXT,
    status TEXT,
    depth INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE task_tree AS (
        -- 起始任务
        SELECT t.id, t.title, t.status, t.parent_id, 0 AS depth
        FROM todos t
        WHERE t.id = task_id AND t.deleted_at IS NULL
        
        UNION ALL
        
        -- 递归获取子任务
        SELECT t.id, t.title, t.status, t.parent_id, tt.depth + 1
        FROM todos t
        INNER JOIN task_tree tt ON t.parent_id = tt.id
        WHERE t.deleted_at IS NULL
    )
    SELECT task_tree.id, task_tree.title, task_tree.status, task_tree.depth
    FROM task_tree
    ORDER BY depth, task_tree.id;
END;
$$ LANGUAGE plpgsql;

-- 函数：递归获取任务的所有祖先任务
CREATE OR REPLACE FUNCTION get_all_ancestors(task_id BIGINT)
RETURNS TABLE (
    id BIGINT,
    title TEXT,
    status TEXT,
    depth INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE task_tree AS (
        -- 起始任务
        SELECT t.id, t.title, t.status, t.parent_id, 0 AS depth
        FROM todos t
        WHERE t.id = task_id AND t.deleted_at IS NULL
        
        UNION ALL
        
        -- 递归获取父任务
        SELECT t.id, t.title, t.status, t.parent_id, tt.depth + 1
        FROM todos t
        INNER JOIN task_tree tt ON t.id = tt.parent_id
        WHERE t.deleted_at IS NULL
    )
    SELECT task_tree.id, task_tree.title, task_tree.status, task_tree.depth
    FROM task_tree
    ORDER BY depth DESC;
END;
$$ LANGUAGE plpgsql;

-- 函数：计算任务完成进度百分比（基于子任务）
CREATE OR REPLACE FUNCTION calculate_progress(task_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
    total_children INTEGER;
    done_children INTEGER;
BEGIN
    SELECT 
        COUNT(*),
        COUNT(CASE WHEN status = 'done' THEN 1 END)
    INTO total_children, done_children
    FROM todos
    WHERE parent_id = task_id AND deleted_at IS NULL;
    
    -- 如果没有子任务，根据自身状态返回
    IF total_children = 0 THEN
        SELECT CASE 
            WHEN status = 'done' THEN 100
            WHEN status = 'doing' THEN 50
            ELSE 0
        END INTO total_children
        FROM todos WHERE id = task_id;
        RETURN total_children;
    END IF;
    
    -- 有子任务时，返回完成百分比
    RETURN ROUND((done_children::NUMERIC / total_children) * 100);
END;
$$ LANGUAGE plpgsql;
