-- SQL 脚本：创建 todos 表，支持任务的层级结构和状态管理

-- 依赖扩展：ltree 用于存储任务路径
CREATE EXTENSION IF NOT EXISTS ltree;

-- 删除旧表（如果存在）
DROP TABLE IF EXISTS todos;

-- 创建 todos 表
CREATE TABLE todos (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- 关联 Supabase 用户表
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done', 'deleted')),  -- 任务状态
    priority INT DEFAULT 0,  -- 0-3，排序用
    parent_id BIGINT REFERENCES todos(id) ON DELETE CASCADE,  -- 父任务
    path LTREE DEFAULT '',  -- ltree 路径，如 'root.123.456'
    json_tree JSONB DEFAULT '{}'::JSONB,  -- 嵌套 JSON，像 GitMind：{"title": "...", "children": [...]}
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deadline  TIMESTAMPTZ DEFAULT NULL,
    progress SMALLINT DEFAULT 0 CHECK (progress BETWEEN 0 AND 100)
);

-- 索引：加速查询
CREATE INDEX idx_todos_parent ON todos(parent_id);
CREATE INDEX idx_todos_path ON todos USING GIST (path);  -- ltree GiST 索引
CREATE INDEX idx_todos_user ON todos(user_id);

-- RLS 策略：用户只看自己任务
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own todos" ON todos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own todos" ON todos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own todos" ON todos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own todos" ON todos FOR DELETE USING (auth.uid() = user_id);