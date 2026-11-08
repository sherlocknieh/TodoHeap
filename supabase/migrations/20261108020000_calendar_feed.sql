-- 日历订阅: 按随机令牌返回该用户的日程
-- 令牌保存在 user_settings.settings.calendarFeedToken, 由前端生成并写入
-- 使用 SECURITY DEFINER 让匿名调用只读这一条路径, 不开放表级匿名访问

CREATE OR REPLACE FUNCTION public.get_calendar_feed(feed_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    owner_id UUID;
    payload JSONB;
BEGIN
    IF feed_token !~ '^[a-f0-9]{32}$' THEN
        RETURN jsonb_build_object('found', false, 'schedules', '[]'::jsonb);
    END IF;

    SELECT us.user_id INTO owner_id
    FROM user_settings us
    WHERE us.settings->>'calendarFeedToken' = feed_token
    LIMIT 1;

    IF owner_id IS NULL THEN
        RETURN jsonb_build_object('found', false, 'schedules', '[]'::jsonb);
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'notes', s.notes,
        'start_at', s.start_at,
        'end_at', s.end_at,
        'updated_at', s.updated_at
    ) ORDER BY s.start_at), '[]'::jsonb)
    INTO payload
    FROM schedules s
    WHERE s.user_id = owner_id;

    RETURN jsonb_build_object('found', true, 'schedules', payload);
END;
$$;

COMMENT ON FUNCTION public.get_calendar_feed(TEXT) IS '日历订阅: 用令牌换取该用户的日程列表';

REVOKE ALL ON FUNCTION public.get_calendar_feed(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_calendar_feed(TEXT) TO anon, authenticated;
