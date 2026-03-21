
-- RPC函数: 删除账号
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS boolean -- 返回布尔值，方便前端判断
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  -- 1. 获取当前调用者的 ID
  current_user_id := auth.uid();

  -- 2. 安全检查：确保用户已登录
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 3. 执行删除（级联会自动处理其他表）
  DELETE FROM auth.users WHERE id = current_user_id;

  RETURN FOUND; -- 如果删除了行则返回 true
END;
$$;


-- 前端调用:
-- const { data, error } = await supabase.rpc('delete_user_account');
