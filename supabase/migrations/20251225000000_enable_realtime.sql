-- 为 todos 表启用 Realtime 功能
-- Supabase Realtime 需要将表添加到 supabase_realtime publication

-- 设置 REPLICA IDENTITY FULL，使 DELETE 和 UPDATE 事件能返回完整的旧记录
-- 这对于基于 user_id 的过滤至关重要
ALTER TABLE todos REPLICA IDENTITY FULL;

-- 幂等操作：检查表是否已在 publication 中，如果没有才添加
DO $$
BEGIN
    -- 首先检查 publication 是否存在，如果不存在则创建
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    -- 检查 todos 表是否已在 publication 中
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'todos'
    ) THEN
        -- 将 todos 表添加到 realtime publication
        ALTER PUBLICATION supabase_realtime ADD TABLE todos;
        RAISE NOTICE 'Added todos table to supabase_realtime publication';
    ELSE
        RAISE NOTICE 'todos table already in supabase_realtime publication';
    END IF;
END $$;