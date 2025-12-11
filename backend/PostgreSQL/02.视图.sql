-- 视图: 预查询表, 为复杂查询提供简化接口


-- 视图：所有叶子任务
CREATE OR REPLACE VIEW leaf_todos AS
SELECT * FROM todos 
WHERE id NOT IN (SELECT DISTINCT parent_id FROM todos WHERE parent_id IS NOT NULL) 
  AND deleted_at IS NULL;


-- 视图：所有根任务
CREATE OR REPLACE VIEW root_todos AS
SELECT * FROM todos 
WHERE parent_id IS NULL AND deleted_at IS NULL;

