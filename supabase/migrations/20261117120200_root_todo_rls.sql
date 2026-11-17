-- TodoHeap: 根任务的行级安全
-- 插入与删除都排除根任务; 更新策略保持不变, 因为重排只能改根任务的 child_ids;
-- 根任务的字段保护由 todos_guard_root 触发器负责

DROP POLICY "Users can insert own todos" ON todos;
CREATE POLICY "Users can insert own todos" ON todos FOR INSERT
    WITH CHECK (user_id = (SELECT auth.uid()) AND NOT is_root);

-- 外键级联(auth.users 删除)不走 RLS, 删号时根任务仍会一起清掉
DROP POLICY "Users can delete own todos" ON todos;
CREATE POLICY "Users can delete own todos" ON todos FOR DELETE
    USING (user_id = (SELECT auth.uid()) AND NOT is_root);
