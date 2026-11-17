-- TodoHeap 数据库基线: 行级安全
-- 所有业务表只允许用户读写自己的数据; 根任务禁止插入与删除, 由函数与触发器维护

-- ---------------------------------------------------------------------------
-- todos
-- ---------------------------------------------------------------------------

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own todos" ON todos FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own todos" ON todos FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- 根任务只允许由 SECURITY DEFINER 函数创建
CREATE POLICY "Users can insert own todos" ON todos FOR INSERT
    WITH CHECK (user_id = (SELECT auth.uid()) AND NOT is_root);

-- 外键级联(auth.users 删除)不走 RLS, 删号时根任务仍会一起清掉
CREATE POLICY "Users can delete own todos" ON todos FOR DELETE
    USING (user_id = (SELECT auth.uid()) AND NOT is_root);

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own settings" ON user_settings FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own settings" ON user_settings FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own settings" ON user_settings FOR UPDATE USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete own settings" ON user_settings FOR DELETE USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- schedules
-- ---------------------------------------------------------------------------

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own schedules" ON schedules FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own schedules" ON schedules FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own schedules" ON schedules FOR UPDATE USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete own schedules" ON schedules FOR DELETE USING (user_id = (SELECT auth.uid()));
