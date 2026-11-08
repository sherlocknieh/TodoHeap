-- TodoHeap 数据库基线: Realtime
-- 变更携带完整旧记录, 便于按 user_id 过滤

ALTER TABLE todos REPLICA IDENTITY FULL;
ALTER TABLE schedules REPLICA IDENTITY FULL;

DO $$
DECLARE
    tbl text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    FOREACH tbl IN ARRAY ARRAY['todos', 'schedules'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
        END IF;
    END LOOP;
END $$;
