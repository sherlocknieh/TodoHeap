-- 清理 create_todo 的旧重载
-- 加 p_client_key 时 CREATE OR REPLACE 因签名不同只新增了重载, 旧的 7 参数版本仍在,
-- PostgREST 带命名参数调用会命中 PGRST203 无法选定候选函数, 创建任务全部失败。
-- 这里删除旧签名, 只保留带 p_client_key 的版本。

DROP FUNCTION IF EXISTS public.create_todo(
    TEXT, TEXT, TIMESTAMPTZ, NUMERIC, TIMESTAMPTZ, BIGINT, TEXT
);
