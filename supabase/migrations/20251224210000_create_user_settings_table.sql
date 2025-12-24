-- 创建用户设置表
CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 添加注释
COMMENT ON TABLE user_settings IS '用户个性化设置表';
COMMENT ON COLUMN user_settings.settings IS '存储用户设置的 JSON 对象，如 {"autoApplyAITasks": false}';

-- 设置 RLS 行级安全策略
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的设置
CREATE POLICY "Users can view own settings" 
    ON user_settings FOR SELECT 
    USING (user_id = (SELECT auth.uid()));

-- 用户只能插入自己的设置
CREATE POLICY "Users can insert own settings" 
    ON user_settings FOR INSERT 
    WITH CHECK (user_id = (SELECT auth.uid()));

-- 用户只能更新自己的设置
CREATE POLICY "Users can update own settings" 
    ON user_settings FOR UPDATE 
    USING (user_id = (SELECT auth.uid()));

-- 用户只能删除自己的设置
CREATE POLICY "Users can delete own settings" 
    ON user_settings FOR DELETE 
    USING (user_id = (SELECT auth.uid()));

-- 创建自动更新 updated_at 的触发器函数（如果不存在）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为 user_settings 表创建触发器
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();